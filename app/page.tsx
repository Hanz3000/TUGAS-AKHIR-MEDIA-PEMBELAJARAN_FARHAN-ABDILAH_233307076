'use client';

import Link from'next/link';
import { useState, useEffect } from'react';
import { useRouter } from'next/navigation';
import { io } from'socket.io-client';
import RfidStatus from'./components/RfidStatus';

export default function Home() {
 const [isHovered, setIsHovered] = useState(false);
 const router = useRouter();

 // --- Socket Listener for Physical Button ---
 useEffect(() => {
 const socket = io('http://localhost:3001');

 socket.on('connect', () => {
 console.log('Home Page Connected to Backend');
 });

 socket.on('game-start', () => {
 console.log('Physical Start Button Pressed! Navigating to Game...');
 router.push('/game');
 });

 return () => {
 socket.disconnect();
 };
 }, [router]);

 return (
 <main className="relative w-full h-screen bg-gradient-to-b from-sky-300 via-blue-200 to-blue-100 overflow-hidden font-sans">
 
 {/* === ANIMATED BACKGROUND LAYERS === */}
 <div className="absolute inset-0 z-0 pointer-events-none">

 {/* Grass hills with layered depth */}
 <div className="absolute bottom-0 w-full">
 {/* Back hill layer - lighter green */}
 <div className="absolute bottom-0 w-full h-36 md:h-52 bg-gradient-to-b from-green-300 to-green-400 rounded-t-[60%] opacity-70"></div>
 
 {/* Mid hill layer */}
 <div className="absolute bottom-0 -left-20 w-full h-28 md:h-44 bg-gradient-to-b from-green-400 to-green-500 rounded-t-[50%] border-t-4 border-green-600/30"></div>
 
 {/* Front hill layer - darkest */}
 <div className="absolute bottom-0 right-0 w-[60%] h-24 md:h-36 bg-gradient-to-b from-green-500 to-green-600 rounded-tl-[80%] border-t-4 border-green-700/40"></div>

 {/* Road with improved texture */}
 <div className="absolute bottom-0 w-full h-20 md:h-28 bg-gradient-to-b from-gray-600 to-gray-800 border-t-4 border-gray-900 flex items-center justify-center overflow-hidden relative shadow-[0_-8px_24px_rgba(0,0,0,0.3)]">
 {/* Road markings */}
 <div className="w-full h-1 border-t-4 border-dashed border-yellow-300 opacity-60 absolute top-1/2 -translate-y-1/2"></div>
 </div>
 </div>
 </div>

 {/* === MAIN CONTENT CARD === */}
 <div className="relative w-full h-full flex flex-col items-center justify-center z-20 p-4">
 {/* Main card with entrance animation */}
 <div className="w-full max-w-3xl bg-white/95 backdrop-blur-md rounded-[48px] border-[10px] border-yellow-400 shadow-[0_20px_60px_rgba(0,0,0,0.25)] flex flex-col items-center justify-center p-8 md:p-12 text-center relative overflow-hidden">
 
 {/* Decorative inner border with gradient */}
 <div className="absolute inset-0 rounded-[38px] border-[6px] border-transparent bg-gradient-to-br from-pink-200/60 via-blue-200/40 to-yellow-200/60 pointer-events-none" style={{ WebkitMask:'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)', WebkitMaskComposite:'xor', maskComposite:'exclude' }}></div>

 {/* Character video with pulsing glow ring */}
 <div className="relative w-44 h-44 md:w-60 md:h-60 mb-6 group">
 {/* Animated glow rings */}
 <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-300 via-orange-300 to-yellow-300 opacity-40"></div>
 <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-300 via-sky-300 to-blue-300 opacity-30"></div>
 
 {/* Video container */}
 <div className="relative w-full h-full rounded-full overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.3)] border-8 border-white ring-8 ring-yellow-300/80 bg-gradient-to-br from-sky-200 to-blue-300 group-">
 <video 
 autoPlay 
 loop 
 muted 
 playsInline 
 className="w-full h-full object-cover"
 >
 <source src="/videos/tampilan_utama1.mp4" type="video/mp4" />
 <div className="w-full h-full flex items-center justify-center text-7xl">👮‍♂️</div>
 </video>
 </div>
 </div>

 {/* Title with slide-up animation and improved typography */}
 <h1 className="text-4xl md:text-6xl lg:text-7xl font-black mb-6 leading-tight tracking-tight flex flex-wrap justify-center gap-x-3">
 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 drop-shadow-[0_2px_8px_rgba(59,130,246,0.3)]">
 PETUALANGAN
 </span>
 <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-orange-500 to-yellow-500 drop-shadow-[0_2px_8px_rgba(251,146,60,0.3)]">
 RAMBU LALU LINTAS
 </span>
</h1>

 {/* Start button with enhanced hover effects */}
 <div className="relative inline-block group z-30">
 {/* Glowing background effect */}
 <div className="absolute -inset-2 bg-gradient-to-r from-green-400 via-emerald-400 to-green-500 rounded-full blur-md opacity-60 group-hover:opacity-100"></div>
 
 <Link href="/game">
 <button 
 onMouseEnter={() => setIsHovered(true)}
 onMouseLeave={() => setIsHovered(false)}
 className="relative px-10 py-5 md:px-14 md:py-6 bg-gradient-to-b from-green-400 via-green-500 to-green-600 hover:from-green-300 hover:via-green-400 hover:to-green-500 rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(34,197,94,0.4)] hover:shadow-[0_12px_32px_rgba(34,197,94,0.5)] border-4 border-white"
 >
 <span className="text-2xl md:text-4xl font-black text-white drop-shadow-[0_3px_6px_rgba(0,0,0,0.3)] flex items-center gap-3 tracking-wide">
 {/* Play icon SVG */}
 <svg 
 width="32" 
 height="32" 
 viewBox="0 0 24 24" 
 fill="white"
 className="drop-shadow-md group-"
 >
 <path d="M5 3L19 12L5 21V3Z" />
 </svg>
 AYO MULAI!
 </span>
 </button>
 </Link>
 </div>
 </div>
 </div>
 
 <RfidStatus />
 </main>
 );
}
