'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type RfidEvent = {
    readerId: number;
    uid: string;
    timestamp: number;
};

export default function RfidStatus() {
    const [lastScan, setLastScan] = useState<RfidEvent | null>(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        // Connect to the separate backend service port
        const socket: Socket = io('http://localhost:3001');

        socket.on('connect', () => {
            console.log('Connected to RFID Backend');
            setConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from RFID Backend');
            setConnected(false);
        });

        socket.on('rfid-tag', (data: RfidEvent) => {
            console.log('RFID Tag Scanned:', data);
            setLastScan(data);
            
            // Auto clear after 3 seconds
            setTimeout(() => setLastScan(null), 3000);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    if (!connected && !lastScan) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            {/* Connection Status Indicator (Visible only if disconnected) */}
            {!connected && (
                <div className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-bold animate-pulse">
                    🔌 Backend Disconnected
                </div>
            )}

            {/* Scan Toast */}
            {lastScan && (
                <div className="bg-white/90 backdrop-blur border-l-4 border-green-500 text-slate-800 px-6 py-4 rounded-r-lg shadow-2xl animate-slide-in-right">
                    <div className="font-bold text-lg">RFID Card Detected!</div>
                    <div className="text-sm text-slate-600">
                        Reader #{lastScan.readerId}
                    </div>
                    <div className="font-mono text-xl mt-1 text-blue-600">
                        {lastScan.uid}
                    </div>
                </div>
            )}
        </div>
    );
}
