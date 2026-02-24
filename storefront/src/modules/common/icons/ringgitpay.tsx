import React from "react"

const RinggitPay = ({ size = 20 }: { size?: number }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path
                d="M8 16V8H12C13.1046 8 14 8.89543 14 10C14 11.1046 13.1046 12 12 12H8M12 12L14 16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

export default RinggitPay
