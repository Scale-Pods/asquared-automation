"use client";

import React from "react";
import Image from "next/image";

interface ASLoaderProps {
    fullScreen?: boolean;
    transparent?: boolean;
}

export const ASLoader = ({ fullScreen = false, transparent = true }: ASLoaderProps) => {
    return (
        <div className={`${fullScreen ? 'fixed inset-0' : 'absolute inset-0 min-h-[400px]'} z-[50] flex items-center justify-center ${transparent ? 'bg-transparent' : 'bg-zinc-950/90'} backdrop-blur-sm transition-all duration-500`}>
            <div className="relative flex flex-col items-center justify-center">

                {/* Animated Background Glow */}
                <div className="absolute w-72 h-72 bg-blue-600/20 rounded-full blur-[100px] animate-pulse"></div>

                {/* Circular Container */}
                <div className="relative w-48 h-48 flex items-center justify-center">
                    {/* Outer Spinning Border */}
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 border-r-cyan-500/30 animate-[spin_3s_linear_infinite]"></div>
                    <div className="absolute inset-4 rounded-full border border-transparent border-b-blue-400 border-l-cyan-400/20 animate-[spin_2s_linear_infinite_reverse]"></div>

                    {/* Inner Content */}
                    <div className="w-36 h-36 bg-zinc-900 rounded-full border border-zinc-800 flex items-center justify-center shadow-[0_0_60px_rgba(37,99,235,0.2)] relative overflow-hidden group">

                        {/* Shimmer Effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>

                        {/* Logo */}
                        <div className="relative z-10 w-28 h-28 flex items-center justify-center">
                            <Image
                                src="/ASquared Logo White-01.png"
                                alt="Asquared Logo"
                                width={112}
                                height={112}
                                className="object-contain animate-pulse"
                                priority
                            />
                        </div>
                    </div>
                </div>

                {/* Text Section */}
                <div className="mt-12 text-center space-y-4">
                    <div className="flex flex-col items-center">
                        <h2 className="text-4xl font-black tracking-[0.2em] uppercase bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            ASQUARED
                        </h2>
                        <div className="h-[1px] w-32 bg-gradient-to-r from-transparent via-blue-500 to-transparent mt-2"></div>
                    </div>

                    <p className="text-[11px] font-bold tracking-[0.5em] text-zinc-500 uppercase">
                        AI Automation Excellence
                    </p>

                    {/* Loading Indicator */}
                    <div className="flex items-center justify-center gap-2 mt-6">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ASLoader;
