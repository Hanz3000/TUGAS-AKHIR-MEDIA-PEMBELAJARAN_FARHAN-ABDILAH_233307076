'use client';
import { useState, useRef, useEffect } from'react';
import Link from'next/link';
import { io } from'socket.io-client';

// Define the structure for Level Data (Active Game Data)
type LevelItem = {
 id: string; // Unique ID for the question
 session: number; // 1, 2, or 3
 slotId: number; // 1, 2, or 3 (Maps to RFID Reader)
 name: string;
 iconImage: string;
 correctCardId: string;
 videoSrc: string;
 color: string;
};

// Define structure for Question Pool (Source Data)
type QuestionItem = Omit<LevelItem,'session' |'slotId'>;

// Pool of 9 Unique Questions to be randomized
const QUESTION_POOL: QuestionItem[] = [
 {
 id:"q1",
 name:"Dilarang parkir",
 iconImage:"/images/rambu_dilarang_parkir.png",
 correctCardId:"3D:1E:71:05",
 videoSrc:"/videos/Rambu_dilarang_parkir.mp4",
 color:"from-red-400 to-red-600",
 },
 {
 id:"q2",
 name:"Bus Stop",
 iconImage:"/images/rambu_bus_stop.png",
 correctCardId:"01:CC:9E:5D",
 videoSrc:"/videos/Rambu_bus_stop.mp4",
 color:"from-orange-400 to-orange-600",
 },
 {
 id:"q3",
 name:"Dilarang berhenti",
 iconImage:"/images/rambu_dilarang_stop.png",
 correctCardId:"F5:CB:19:06",
 videoSrc:"/videos/Rambu_dilarang_berhenti.mp4",
 color:"from-blue-400 to-blue-600",
 },
 // Placeholders for Q4-Q9 (In real app, these would be unique)
 {
 id:"q4",
 name:"Lampu merah",
 iconImage:"/images/rambu_merah.png", // Placeholder image
 correctCardId:"6D:23:6F:05", // Placeholder ID
 videoSrc:"/videos/Rambu_lampu_merah.mp4",
 color:"from-purple-400 to-purple-600",
 },
 {
 id:"q5",
 name:"Penyebrangan",
 iconImage:"/images/rambu_penyebrangan.png", // Placeholder
 correctCardId:"B6:7C:22:06", // Placeholder
 videoSrc:"/videos/Rambu_penyebrangan.mp4",
 color:"from-pink-400 to-pink-600",
 },
 {
 id:"q6",
 name:"Stop",
 iconImage:"/images/rambu_stop.png", // Placeholder
 correctCardId:"1C:92:23:06", // Placeholder
 videoSrc:"/videos/Rambu_stop.mp4",
 color:"from-indigo-400 to-indigo-600",
 },
 {
 id:"q7",
 name:"Belok kanan",
 iconImage:"/images/rambu_belok_kanan.png", // Placeholder
 correctCardId:"8D:91:24:06", // Placeholder
 videoSrc:"/videos/Rambu_belok_kanan.mp4",
 color:"from-teal-400 to-teal-600",
 },
 {
 id:"q8",
 name:"rambu hijau",
 iconImage:"/images/rambu_hijau.png", // Placeholder
 correctCardId:"EB:D2:70:05", // Placeholder
 videoSrc:"/videos/Rambu_lampu_hijau.mp4",
 color:"from-emerald-400 to-emerald-600",
 },
 {
 id:"q9",
 name:"rambu kuning",
 iconImage:"/images/rambu_kuning.png", // Placeholder
 correctCardId:"D1:2E:70:05", // Placeholder
 videoSrc:"/videos/Rambu_lampu_kuning.mp4",
 color:"from-cyan-400 to-cyan-600",
 },
];

// Audio Assets
const AUDIO_CORRECT ="/sounds/correct-ding.mp3";
const AUDIO_WRONG ="/sounds/error.mp3";
const AUDIO_CELEBRATION ="/sounds/success.m4a";
const AUDIO_START ="/sounds/start-game.mp3";

type SlotStatus ='idle' |'correct' |'wrong';

// Helper: Shuffle Array (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
 const newArr = [...array];
 for (let i = newArr.length - 1; i > 0; i--) {
 const j = Math.floor(Math.random() * (i + 1));
 [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
 }
 return newArr;
}

export default function GamePage() {
 // --- STATE MANAGEMENT ---
 const [gameLevels, setGameLevels] = useState<LevelItem[]>([]);
 const [isGameReady, setIsGameReady] = useState(false);
 
 const [currentSession, setCurrentSession] = useState<number>(1); // 1, 2, or 3
 const [gameState, setGameState] = useState<'playing' |'celebration' |'reward_sequence' |'finished'>('playing');
 
 // Slots status for the CURRENT session (only tracks 3 slots at a time)
 const [slotsStatus, setSlotsStatus] = useState<Record<number, SlotStatus>>({
 1:'idle', 2:'idle', 3:'idle'
 });
 
 const [feedbackSlot, setFeedbackSlot] = useState<{id: number, type:'correct' |'wrong'} | null>(null);
 
 // Video index relative to the CURRENT session (0, 1, 2)
 const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0);
 
 const [showModal, setShowModal] = useState(false);
 
 const videoRef = useRef<HTMLVideoElement>(null);
 const audioRef = useRef<HTMLAudioElement>(null);

 // UseRef for gameState to avoid stale closure in socket listeners
 const gameStateRef = useRef(gameState);
 useEffect(() => {
 gameStateRef.current = gameState;
 }, [gameState]);

 // Derived state: Get data for current session
 const currentSessionData = gameLevels.filter(item => item.session === currentSession);

 // --- INITIALIZATION: SHUFFLE & ASSIGN QUESTIONS ---
 useEffect(() => {
 // Shuffle the pool
 const shuffledPool = shuffleArray(QUESTION_POOL);
 
 // Take the first 9 (in case pool grows larger)
 const selectedQuestions = shuffledPool.slice(0, 9);
 
 // Assign to sessions
 const organizedLevels: LevelItem[] = selectedQuestions.map((q, index) => {
 // Index 0-2 -> Session 1
 // Index 3-5 -> Session 2
 // Index 6-8 -> Session 3
 const session = Math.floor(index / 3) + 1;
 
 // Slot ID 1, 2, 3 repeating for each session
 const slotId = (index % 3) + 1;
 
 return {
 ...q,
 session,
 slotId
 };
 });
 
 setGameLevels(organizedLevels);
 setIsGameReady(true);
 playAudio(AUDIO_START);
 }, []);

 useEffect(() => {
 if (!isGameReady) return;

 // --- RFID Socket Connection ---
 const socket = io('http://localhost:3001');

 socket.on('connect', () => {
 console.log('Game Page Connected to RFID Backend');
 // Reset all readers on load to ensure they are active
 socket.emit('reset_all_readers');
 });
 
 socket.on('game-start', () => {
 console.log('Game Page RFID Event: game-start');
 if (gameStateRef.current ==='finished') {
 window.location.reload();
 }
 });

 socket.on('rfid-tag', (data: { readerId: number; uid: string }) => {
 console.log('Game Page RFID Event:', data);
 
 // Find the slot in the current session that matches the readerId
 const currentSessionItems = gameLevels.filter(item => item.session === currentSession);
 const targetItem = currentSessionItems.find(item => item.slotId === data.readerId);
 
 if (targetItem) {
 // Pass the socket instance to handleRFIDScan or use a ref/closure if needed
 // For simplicity, we can just call the logic here or pass socket to function.
 // But handleRFIDScan updates state, so it's better to keep it separate.
 // We will modify handleRFIDScan to accept socket or move socket to ref.
 handleRFIDScan(data.readerId, data.uid, socket);
 }
 });

 return () => {
 socket.disconnect();
 };
 }, [currentSession, isGameReady, gameLevels]); // Re-bind socket logic if session changes (mostly for closures capturing currentSession)

 // --- LOGIKA ANIMASI FEEDBACK ---
 useEffect(() => {
 if (feedbackSlot) {
 const timer = setTimeout(() => {
 setFeedbackSlot(null);
 }, 3000);
 return () => clearTimeout(timer);
 }
 }, [feedbackSlot]);

 // --- LOGIKA CEK KONDISI MENANG (PER SESI) ---
 useEffect(() => {
 if (!isGameReady || currentSessionData.length === 0) return;

 // Check if all slots in the current session are correct
 const allCorrect = currentSessionData.every(item => slotsStatus[item.slotId] ==='correct');
 
 if (allCorrect && gameState ==='playing') {
 const timer = setTimeout(() => {
 playAudio(AUDIO_CELEBRATION);
 setGameState('celebration');
 }, 2000);
 return () => clearTimeout(timer);
 }
 }, [slotsStatus, gameState, currentSessionData, isGameReady]);

 // --- LOGIKA TRANSISI: DARI CELEBRATION KE VIDEO ---
 useEffect(() => {
 if (gameState ==='celebration') {
 const timer = setTimeout(() => {
 setGameState('reward_sequence');
 setCurrentVideoIndex(0); // Reset video index for the reward sequence
 }, 4000);
 return () => clearTimeout(timer);
 }
 }, [gameState]);


 // --- LOGIKA SCAN RFID ---
 // Added socket argument to emit events (frontend ke backend untuk disable/suspend reader)
 const handleRFIDScan = (slotId: number, scannedCardId: string, socket?: any) => {
 if (gameState !=='playing') return;
 if (slotsStatus[slotId] ==='correct') return;

 // Find the item for this slot in the current session
 // We must use the current session's data derived from state
 const currentSessionItems = gameLevels.filter(item => item.session === currentSession);
 const targetData = currentSessionItems.find(d => d.slotId === slotId);
 
 // Safety check
 if (!targetData) return;

 if (scannedCardId === targetData.correctCardId) {
 playAudio(AUDIO_CORRECT);
 setSlotsStatus(prev => ({ ...prev, [slotId]:'correct' }));
 setFeedbackSlot({ id: slotId, type:'correct' });
 
 // Disable reader for this session
 if (socket) {
 socket.emit('disable_reader', { readerId: slotId });
 } else {
 // Fallback if socket not passed (e.g. simulation button)
 // We might need a global socket ref if we want buttons to also talk to backend, 
 // but buttons are for simulation so maybe strictly not needed to disable PHYSICAL reader?
 // Actually, if we simulate a correct answer on UI, we DO want to disable the physical reader too
 // to prevent accidental scans.
 // For now, let's create a temp connection or just assume buttons are for testing without hardware.
 // Ideally, we lift socket to a Ref.
 const tempSocket = io('http://localhost:3001');
 tempSocket.emit('disable_reader', { readerId: slotId });
 // We don't disconnect immediately to ensure message is sent, or rely on the main socket.
 // Better approach: Use a socket ref.
 }

 } else {
 playAudio(AUDIO_WRONG);
 setSlotsStatus(prev => ({ ...prev, [slotId]:'wrong' }));
 setFeedbackSlot({ id: slotId, type:'wrong' });
 
 // Suspend reader for 4s
 if (socket) {
 socket.emit('suspend_reader', { readerId: slotId, duration: 4000 });
 } else {
 const tempSocket = io('http://localhost:3001');
 tempSocket.emit('suspend_reader', { readerId: slotId, duration: 4000 });
 }
 }
 };

 // --- LOGIKA VIDEO BERGANTIAN ---
 const handleVideoEnded = () => {
 // Current session has 3 videos (indices 0, 1, 2)
 if (currentVideoIndex < currentSessionData.length - 1) {
 setCurrentVideoIndex(prev => prev + 1);
 } else {
 // Finished all videos for this session
 handleSessionComplete();
 }
 };

 const handleSessionComplete = () => {
 // Reset all readers for the next session/finish
 const socket = io('http://localhost:3001');
 socket.emit('reset_all_readers');

 if (currentSession < 3) {
 // Move to next session
 setCurrentSession(prev => prev + 1);
 // Reset state for next session
 setSlotsStatus({ 1:'idle', 2:'idle', 3:'idle' });
 setGameState('playing');
 playAudio(AUDIO_START);
 } else {
 // Finished all 3 sessions
 setGameState('finished');
 }
 };

 // Helper Audio
 const playAudio = (src: string) => {
 if (audioRef.current) {
 audioRef.current.src = src;
 audioRef.current.currentTime = 0;
 audioRef.current.play().catch(e => console.log("Audio error:", e));
 }
 };

 useEffect(() => {
 if (gameState ==='reward_sequence' && videoRef.current) {
 videoRef.current.load();
 videoRef.current.play();
 }
 }, [currentVideoIndex, gameState]);
 
 if (!isGameReady) {
 return (
 <div className="w-full h-screen flex items-center justify-center bg-sky-200">
 <h1 className="text-4xl font-black text-white">MEMUAT PERMAINAN...</h1>
 </div>
 )
 }

 return (
 <main className="relative w-full min-h-screen overflow-hidden font-sans selection:bg-none bg-gradient-to-b from-sky-300 via-sky-200 to-green-100">
 {/* === BACKGROUND PARALLAX === */}
 <div className="absolute inset-0 pointer-events-none">
 

 {/* Rumput / Bukit */}
 <div className="absolute bottom-0 w-full h-40">
 <svg className="w-full h-full" viewBox="0 0 1200 200" preserveAspectRatio="none">
 <defs>
 <linearGradient id="grassGradient" x1="0%" y1="0%" x2="0%" y2="100%">
 <stop offset="0%" style={{ stopColor:'#22c55e', stopOpacity: 1 }} />
 <stop offset="100%" style={{ stopColor:'#16a34a', stopOpacity: 1 }} />
 </linearGradient>
 </defs>
 <path
 d="M 0,100 Q 300,40 600,100 T 1200,100 L 1200,200 L 0,200 Z"
 fill="url(#grassGradient)"
 />
 <path
 d="M 0,120 Q 200,80 400,120 T 800,120 T 1200,120 L 1200,200 L 0,200 Z"
 fill="#15803d"
 opacity="0.6"
 />
 </svg>
 </div>

 {/* Jalan raya */}
 <div className="absolute bottom-12 w-full h-16 bg-gradient-to-b from-gray-600 to-gray-800 flex items-center justify-center">
 <div className="w-full flex gap-8 px-4">
 <div className="h-1 flex-1 bg-yellow-300 rounded-full"></div>
 <div className="h-1 flex-1 bg-yellow-300 rounded-full"></div>
 <div className="h-1 flex-1 bg-yellow-300 rounded-full"></div>
 </div>
 </div>
 </div>

 {/* === AUDIO REF === */}
 <audio ref={audioRef} className="hidden" />

 

 <div className="relative z-10 w-full min-h-screen flex flex-col items-center justify-center p-4 pt-6 md:pt-8">
 {/* --- STATE: PLAYING --- */}
 {gameState ==='playing' && (
 <div className="w-full max-w-7xl flex flex-col items-center">
 {/* HOME BUTTON */}
 <Link
 href="/"
 className="absolute top-6 left-6 bg-white hover:bg-yellow-50 text-blue-600 p-4 rounded-full shadow-lg font-bold text-2xl hover:shadow-xl border-4 border-blue-300 z-50 flex items-center justify-center"
>
 <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5l9-7 9 7M5 9.5V20h14V9.5" />
 </svg>
</Link>

 {/* SESSION INDICATOR */}
 <div className="absolute top-6 right-6 bg-white text-blue-600 px-6 py-2 rounded-full shadow-lg font-black text-xl border-4 border-blue-300 z-50">
 SESI {currentSession} / 3
 </div>

 {/* HEADER DENGAN IKON */}
 <div className="text-center mb-8 relative">
 <div className="inline-block relative">
 

 <h2 className="text-3xl md:text-5xl font-black text-white text-center mb-8 drop-shadow-lg stroke-black bg-orange-500/80 px-8 py-3 rounded-full border-4 border-white">
 COCOKKAN GAMBAR DENGAN KARTUMU!
 </h2>
 </div>
 </div>

 {/* GRID 3 KOLOM */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-12">
 {currentSessionData.map((item) => {
 const status = slotsStatus[item.slotId];
 const isFeedback = feedbackSlot?.id === item.slotId;
 const feedbackType = feedbackSlot?.type;

 return (
 <div
 key={item.id}
 className={`relative bg-white rounded-[50px] p-6 flex flex-col items-center 
 ${status ==='correct' ?'border-b-8 border-green-500 ring-4 ring-green-300 z-10 shadow-2xl' :''}
 ${status ==='wrong' ?'border-b-8 border-red-400 ring-4 ring-red-200 shadow-xl' :''}
 ${status ==='idle' ?'border-b-8 border-blue-200 shadow-2xl hover:shadow-3xl cursor-pointer' :''}
 `}
 >
 {/* SLOT BADGE */}
 <div
 className={`absolute -top-6 px-8 py-3 rounded-full text-white font-black text-2xl shadow-lg border-4 border-white bg-gradient-to-r ${item.color}`}
 >
 SLOT {item.slotId}
 </div>

 {/* CARD IMAGE AREA */}
 <div
 className={`w-full aspect-square rounded-[35px] mb-4 mt-6 flex items-center justify-center overflow-hidden border-4 relative group 
 ${status ==='correct' ?'bg-green-50 border-green-400 border-solid shadow-lg' :''}
 ${status ==='wrong' ?'bg-red-50 border-red-300 border-solid shadow-md' :''}
 ${status ==='idle' ?'bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-300 border-dashed shadow-lg hover:shadow-2xl hover:border-solid' :''}
 `}
 >
 {/* FEEDBACK ANIMATION */}
 {isFeedback ? (
 feedbackType ==='correct' ? (
 <div className="flex flex-col items-center justify-center relative w-full h-full">
 
 <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
  <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
 </div>

 <span className="text-green-600 font-black text-4xl mt-3 drop-shadow-md">BENAR!</span>
</div>
 ) : (
 <div className="flex flex-col items-center justify-center w-full h-full">
 
 <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
  <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
 </div>

 <span className="text-red-600 font-black text-3xl mt-2 drop-shadow-md">SALAH!</span>

 <p className="text-red-500 font-bold text-base mt-2 bg-white/80 px-4 py-2 rounded-full">
  Coba Lagi Ya 🙂
 </p>
</div>
 )
 ) : (
 <div className="text-center flex flex-col items-center justify-center h-full w-full p-4 relative">
 <img
 src={item.iconImage}
 alt={item.name}
 className="w-4/5 h-4/5 object-contain drop-shadow-md"
 />
 {status ==='idle' && (
 <div className="absolute bottom-4 bg-blue-500 text-white px-4 py-2 rounded-full font-bold text-sm shadow-md border-2 border-white">
 Tempel Kartu Di Papan
 </div>
 )}
 </div>
 )}
 </div>

 

 {/* STATUS BADGE */}
 <div
 className={`mt-4 w-full py-3 rounded-2xl text-center font-black text-white text-lg shadow-lg border-2 border-white
 ${status ==='correct' ?'bg-gradient-to-r from-green-400 to-emerald-500' :''}
 ${status ==='wrong' ?'bg-red-400' :''}
 ${status ==='idle' ?'bg-gradient-to-r from-blue-400 to-cyan-400' :''}
 `}
 >
 {status ==='correct' &&"TERISI BENAR"}
 {status ==='wrong' &&"KARTU SALAH"}
 {status ==='idle' &&"MENUNGGU..."}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 
 {/* --- CELEBRATION (HEBAT!) --- */}
 {gameState ==='celebration' && (
 <div className={`fixed inset-0 z-50 flex items-center justify-center p-4'' :''}`}>
 <div className="absolute inset-0 bg-gradient-to-b from-sky-400 to-blue-200">
  <div className="absolute bottom-0 w-full h-32 bg-green-500 rounded-t-[50%] border-t-8 border-green-600"></div>
  </div>
 <div className="relative z-10 bg-[#6aeba2] rounded-[40px] border-8 border-yellow-400 shadow-[0_20px_60px_rgba(0,0,0,0.4)] p-8 flex flex-col items-center text-center max-w-2xl w-full">
 <div className="relative w-full h-64 md:h-80 mb-4 flex items-center justify-center">
 <img
  src="/images/fiks.gif"
  alt="celebration"
  className="w-full h-full object-contain"
/>
 </div>
 <h2 className="text-6xl md:text-8xl font-black text-white drop-shadow-md mb-4 stroke-text">
 HEBAT!
 </h2>
 <div className="bg-white/20 px-8 py-3 rounded-full">
 <p className="text-2xl md:text-3xl font-bold text-green-800">
 Semua Jawaban Benar!
 </p>
 </div>
 </div>
 </div>
 )}
 {/* --- (PENJELASAN VIDEO) --- */}
{gameState ==='reward_sequence' && currentSessionData[currentVideoIndex] && (
 <div className="fixed inset-0 z-50 bg-gradient-to-b from-sky-400 to-blue-200 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8">

 <div className="absolute inset-0 pointer-events-none">
 <div className="absolute bottom-0 w-full h-32 bg-green-500 rounded-t-[50%] border-t-8 border-green-600"></div>
</div>

 {/* Konten utama */}
 <div className="relative z-10 w-full max-w-5xl px-4 sm:px-6 md:px-8 flex flex-col items-center">
 <div className="w-full text-center mb-3 sm:mb-4">
 <h2 className="inline-block bg-white/80 backdrop-blur-md px-8 py-3 sm:px-10 sm:py-4 rounded-full shadow-lg border-2 border-yellow-400/70">
 <span className="text-2xl sm:text-3xl md:text-4xl font-black text-blue-900 drop-shadow-md">
 {currentSessionData[currentVideoIndex].name}
 </span>
 </h2>
 </div>
 <div className="relative w-full aspect-video rounded-2xl sm:rounded-3xl overflow-hidden border-6 border-yellow-400/90 shadow-xl shadow-yellow-400/20">
 <video
 ref={videoRef}
 className="w-full h-full object-contain"
 onEnded={handleVideoEnded}
 src={currentSessionData[currentVideoIndex].videoSrc}
 autoPlay
 playsInline
 />

 <div className="absolute top-3 right-3 sm:top-4 sm:right-5 bg-yellow-400/80 backdrop-blur-sm text-white font-bold px-4 py-1.5 rounded-full text-sm sm:text-base shadow-md">
 Video {currentVideoIndex + 1} dari 3
 </div>
 </div>
 <div className="text-center mt-6 sm:mt-8 md:mt-10 px-4 w-full flex flex-col items-center gap-4">
 <p className="text-yellow-200 text-lg sm:text-xl md:text-2xl font-bold drop-shadow-md">
 Sedang memutar penjelasan...
 </p>
 {/* <button
 onClick={handleVideoEnded}
 className="bg-white/20 hover:bg-white/30 text-white border-2 border-white/50 backdrop-blur-sm px-8 py-3 rounded-full font-bold text-lg md:text-xl shadow-lg flex items-center gap-2"
 >
 LEWATI VIDEO ??
 </button> */}
 </div>
 </div>
 </div>
)}
 {/* --- FINISHED --- */}
 {gameState ==='finished' && (
 <div className="fixed inset-0 z-50 bg-gradient-to-b from-purple-400 via-pink-300 to-purple-200 flex flex-col items-center justify-center p-4">
 

 <div className="relative z-10 bg-gradient-to-br from-yellow-300 via-orange-300 to-yellow-400 p-12 rounded-[50px] text-center border-8 border-white shadow-2xl max-w-2xl w-full">
 <div className="mb-6 flex justify-center">
 <div className="w-28 h-28 bg-yellow-500 rounded-full flex items-center justify-center shadow-xl border-4 border-white">
  <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
   <path d="M18 2H6v2H2v3c0 3.31 2.69 6 6 6h.17A6.002 6.002 0 0011 16.91V19H8v2h8v-2h-3v-2.09A6.002 6.002 0 0015.83 13H16c3.31 0 6-2.69 6-6V4h-4V2zM4 7V6h2v5c-1.1 0-2-.9-2-2zm16 0c0 1.1-.9 2-2 2V6h2v1z"/>
  </svg>
 </div>
</div>
 <h1 className="text-6xl md:text-7xl font-black text-white drop-shadow-lg mb-6">LUAR BIASA!</h1>
 <p className="text-2xl text-white font-bold mb-10 drop-shadow-md">Kamu Sudah Menyelesaikan Semua Sesi!</p>

 <Link href="/">
 <button className="bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-white text-3xl font-black py-5 px-16 rounded-full shadow-xl border-4 border-white">
 MAIN LAGI
 </button>
 </Link>
 </div>
 </div>
 )}
 </div>

 {/* === TOMBOL SIMULASI === */}
 {gameState ==='playing' && (
 <button
 onClick={() => setShowModal(!showModal)}
 className="fixed bottom-8 right-8 bg-gradient-to-br from-purple-500 to-pink-500 text-white w-20 h-20 rounded-full font-bold shadow-2xl border-4 border-white z-50 flex items-center justify-center text-4xl hover:shadow-3xl"
 >
 🛠️
 </button>
 )}

 {/* === MODAL SIMULASI === */}
 {showModal && (
 <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
 <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative border-4 border-blue-300">
 {/* CLOSE BUTTON */}
 <button
 onClick={() => setShowModal(false)}
 className="absolute top-4 right-4 text-white bg-red-500 hover:bg-red-600 font-bold text-2xl w-12 h-12 rounded-full border-2 border-white"
 >
 ✕
 </button>

 {/* TITLE */}
 <h3 className="font-black text-2xl mb-6 text-center border-b-4 border-blue-400 pb-3 text-blue-900">
 Simulasi Sensor RFID
 </h3>

 {/* BUTTONS */}
 <div className="space-y-4">
 {currentSessionData.map((item) => (
 <div
 key={item.id}
 className="flex items-center gap-3 p-4 border-4 border-blue-300 rounded-2xl bg-white shadow-md hover:shadow-lg"
 >
 <div className="font-black text-lg text-blue-900 min-w-fit bg-blue-100 px-4 py-2 rounded-full border-2 border-blue-300">
 Slot {item.slotId}
 </div>

 <button
 onClick={() => handleRFIDScan(item.slotId, item.correctCardId)}
 disabled={slotsStatus[item.slotId] ==='correct'}
 className="flex-1 bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-white py-3 rounded-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
 >
 Benar
 </button>

 <button
 onClick={() => handleRFIDScan(item.slotId,"WRONG_CARD")}
 disabled={slotsStatus[item.slotId] ==='correct'}
 className="bg-gradient-to-r from-red-400 to-rose-500 hover:from-red-500 hover:to-rose-600 text-white px-4 py-3 rounded-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
 >
 Salah
 </button>
 </div>
 ))}
 </div>
 </div>
 </div>
 )}

 {/* === CUSTOM STYLES === */}
 <style jsx>{`
 @keyframes spin-slow {
 from {
 : rotate(0deg);
 }
 to {
 : rotate(360deg);
 }
 }

 @keyframes fade-in {
 from {
 opacity: 0;
 }
 to {
 opacity: 1;
 }
 }

 @keyframes zoom-in {
 from {
 : scale(0.8);
 opacity: 0;
 }
 to {
 : scale(1);
 opacity: 1;
 }
 }

 @keyframes shake-soft {
 0%, 100% {
 : translateX(0);
 }
 25% {
 : translateX(-8px);
 }
 75% {
 : translateX(8px);
 }
 }

 @keyframes confetti {
 to {
 : translateY(100vh) rotate(360deg);
 opacity: 0;
 }
 }

 @keyframes sparkle {
 0%, 100% {
 opacity: 0;
 : scale(0);
 }
 50% {
 opacity: 1;
 : scale(1);
 }
 }

 @keyframes drift {
 0%, 100% {
 : translateX(0);
 }
 50% {
 : translateX(30px);
 }
 }

 @keyframes drift-slow {
 0%, 100% {
 : translateX(0);
 }
 50% {
 : translateX(20px);
 }
 }

 @keyframes float {
 0%, 100% {
 : translateY(0px);
 opacity: 0.9;
 }
 50% {
 : translateY(-20px);
 opacity: 1;
 }
 }

 @keyframes slide-down {
 from {
 opacity: 0;
 : translateY(-30px);
 }
 to {
 opacity: 1;
 : translateY(0);
 }
 }

 @keyframes bounce {
 0%, 100% {
 : translateY(0);
 }
 50% {
 : translateY(-15px);
 }
 }

 . {
 animation: confetti 3s linear forwards;
 }

 . {
 animation: sparkle 1.5s ease-in-out infinite;
 }

 . {
 animation: drift 6s ease-in-out infinite;
 }

 . {
 animation: drift-slow 8s ease-in-out infinite;
 }

 . {
 animation: float 4s ease-in-out infinite;
 }

 . {
 animation: slide-down 0.6s ease-out;
 }

 . {
 animation: shake-soft 0.4s ease-in-out;
 }

 . {
 animation: zoom-in 0.6s ease-out;
 }

 . {
 animation: fade-in 0.5s ease-out;
 }

 .stroke-text {
 text-shadow:
 -2px -2px 0 #1e3a8a,
 2px -2px 0 #1e3a8a,
 -2px 2px 0 #1e3a8a,
 2px 2px 0 #1e3a8a,
 -3px 0 0 #1e3a8a,
 3px 0 0 #1e3a8a,
 0 -3px 0 #1e3a8a,
 0 3px 0 #1e3a8a;
 }

 . {
 : scale(1.02);
 }

 .hover\::hover {
 : scale(1.02);
 }
 `}</style>
 </main>
 );
}
