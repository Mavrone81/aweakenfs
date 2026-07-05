# Workflow & Architecture Diagrams

**Last updated:** 2026-06-24

Diagrams are written in [Mermaid](https://mermaid.js.org/) and render on GitHub,
in VS Code (with a Mermaid extension), and in most Markdown viewers.

---

## 1. System architecture

```mermaid
flowchart TB
    subgraph Client
        Shopper["Shopper (browser)"]
    end

    subgraph Storefront["Next.js Storefront"]
        SF["Pages / Checkout UI"]
        CB["/api/ringgitpay/callback"]
        HC["/api/healthcheck"]
    end

    subgraph Backend["Medusa Backend (Node 22, Medusa 2.8.8)"]
        StoreAPI["Store API /store/*"]
        AdminAPI["Admin API + Dashboard"]
        KeyEx["/key-exchange"]
        PayMod["Payment Module<br/>stripe · ringgitpay · hitpay"]
        WHr["/api/webhooks/ringgitpay"]
        WHh["/webhooks/hitpay"]
        Notif["Notification Module<br/>Resend / SendGrid"]
        Subs["Subscribers<br/>order.placed · invite.created"]
        WF["completeCartWorkflow"]
    end

    subgraph Infra["Infrastructure (optional)"]
        PG[("PostgreSQL")]
        Redis[("Redis<br/>event bus + workflow engine")]
        MinIO[("MinIO<br/>media")]
        Meili[("MeiliSearch<br/>product index")]
    end

    subgraph Providers["External providers"]
        RP["RinggitPay"]
        HP["HitPay"]
        Stripe["Stripe"]
        Email["Resend / SendGrid"]
    end

    Shopper --> SF
    SF -->|x-publishable-api-key| StoreAPI
    SF -->|fetch pk| KeyEx
    StoreAPI --> PayMod
    PayMod -->|initiatePayment| RP & HP & Stripe

    Shopper -->|hosted payment| RP & HP & Stripe
    RP -->|browser form-POST return| CB
    CB -->|303 redirect| SF

    RP -->|server webhook| WHr
    HP -->|server webhook| WHh
    Stripe -->|webhook| PayMod

    WHr --> WF
    WF --> Subs
    Subs --> Notif --> Email

    Backend --- PG
    Backend --- Redis
    Backend --- MinIO
    StoreAPI --- Meili
```

---

## 2. Checkout → payment → order (happy path, RinggitPay)

```mermaid
sequenceDiagram
    autonumber
    actor S as Shopper
    participant SF as Storefront (Next.js)
    participant BE as Medusa Backend
    participant RPmod as RinggitPay provider
    participant RP as RinggitPay GW
    participant WH as /api/webhooks/ringgitpay
    participant WF as completeCartWorkflow
    participant Mail as Notification (email)

    S->>SF: Build cart, enter shipping/email (optional)
    SF->>BE: Create payment collection + payment session (provider=ringgitpay)
    BE->>RPmod: initiatePayment(amount, currency, cart)
    RPmod-->>BE: session.data { checkSum, amount, returnURL, payment_url, ... }
    BE-->>SF: payment session (status=pending)
    SF->>RP: Redirect shopper to hosted payment (signed payload)
    S->>RP: Completes payment

    par Browser return (UX)
        RP->>SF: form-POST returnURL (/api/ringgitpay/callback)
        SF-->>S: 303 → /{cc}/ringgitpay/success
    and Server webhook (authoritative)
        RP->>WH: POST rp_* fields + rp_checkSum
        WH->>RPmod: getWebhookActionAndData() → verify checksum
        alt RP00 (success) & checksum valid
            WH->>BE: updatePaymentSession(status=captured)
            WH->>BE: find cart by reference (cart_… / paysess_…)
            alt cart not completed_at
                WH->>WF: run({ id: cartId })
                WF-->>BE: Order created
                BE->>Mail: emit order.placed → send confirmation
            else already completed
                WH-->>WH: skip (idempotent)
            end
        else RP09 (pending)
            WH->>BE: keep session pending
        else failure / bad checksum
            WH->>BE: updatePaymentSession(status=canceled)
        end
        WH-->>RP: 200 { received: true }
    end
```

---

## 3. Checkout → payment (HitPay)

```mermaid
sequenceDiagram
    autonumber
    actor S as Shopper
    participant SF as Storefront
    participant BE as Medusa Backend
    participant HPmod as HitPay provider
    participant HP as HitPay API
    participant WH as /webhooks/hitpay

    S->>SF: Checkout, select HitPay
    SF->>BE: Create payment session (provider=hitpay)
    BE->>HPmod: initiatePayment(amount, currency=SGD)
    HPmod->>HP: POST /v1/payment-requests (X-BUSINESS-API-KEY)
    HP-->>HPmod: { id, payment_url, ... }
    HPmod-->>BE: session.data { payment_url, metadata.session_id }
    BE-->>SF: payment session (pending)
    SF->>HP: Redirect shopper to payment_url
    S->>HP: Completes payment
    HP->>WH: POST { event_type, amount, metadata.session_id }
    WH->>HPmod: getWebhookActionAndData()
    alt event_type = success
        WH->>BE: updatePaymentSession(status=captured)
    else event_type = authorized_amount
        WH->>BE: updatePaymentSession(status=authorized)
    else other / error
        WH->>BE: status=canceled / skip
    end
    WH-->>HP: 200 { received: true }
    Note over S,HP: HitPay redirect_url returns shopper to<br/>/{cc}/order/confirmed/{id} (or back to review for temp_ ids)
```

---

## 4. Payment-session state machine

```mermaid
stateDiagram-v2
    [*] --> pending: initiatePayment()
    pending --> authorized: webhook authorized_amount (HitPay)
    pending --> captured: RP00 (RinggitPay) / success (HitPay)
    authorized --> captured: capture
    pending --> pending: RP09 (RinggitPay pending)
    pending --> canceled: failure / bad checksum
    captured --> [*]: completeCartWorkflow → Order
    canceled --> [*]
```

---

## 5. Order-confirmation notification flow

```mermaid
flowchart LR
    A["completeCartWorkflow<br/>creates Order"] --> B(["event: order.placed"])
    B --> C["Subscriber: order-placed.ts"]
    C --> D["Retrieve order + items + shipping address + summary"]
    D --> E["Notification Module"]
    E -->|Resend configured| F["Resend"]
    E -->|SendGrid configured| G["SendGrid"]
    F & G --> H["Order confirmation email<br/>(React-Email template)"]
```

---

## 6. Graceful-degradation decision flow (backend boot)

```mermaid
flowchart TD
    Start([Backend boot / medusa-config.js]) --> R{REDIS_URL set?}
    R -->|yes| RR[Redis event bus + Redis workflow engine]
    R -->|no| RS[Simulated in-memory bus]

    Start --> F{MINIO_* set?}
    F -->|yes| FM[MinIO file storage<br/>bucket medusa-media]
    F -->|no| FL[Local file storage /static]

    Start --> M{MEILISEARCH_* set?}
    M -->|yes| MM[Index products in MeiliSearch]
    M -->|no| MD[Search disabled]

    Start --> N{Resend or SendGrid keys?}
    N -->|yes| NN[Email notifications enabled]
    N -->|no| ND[No email provider]

    Start --> P{Payment provider keys?}
    P -->|STRIPE_*| PS[Enable Stripe]
    P -->|RINGGITPAY_*| PR[Enable RinggitPay]
    P -->|HITPAY_API_KEY| PH[Enable HitPay]
```
