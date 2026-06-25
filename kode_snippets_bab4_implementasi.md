# BAB 4: IMPLEMENTASI PERANGKAT LUNAK
## Kode-Kode Krusial Sistem Media Pembelajaran Interaktif Berbasis IoT

---

## 1. INISIALISASI PERANGKAT KERAS (Hardware Initialization)

### 1.1 Setup GPIO dan SPI untuk Sensor RFID dan Push Button

**File:** `backend-py/app.py` (Baris 14-71)

```python
# --- Hardware Setup ---
IS_LINUX = platform.system() == 'Linux'
print(f"Running on Platform: {platform.system()}")

readers = []
buffer_pins = [17, 27, 22]  # GPIO pins for 3 RFID readers
BUTTON_PIN = 6              # GPIO pin for push button

# --- Reader State Management ---
# States: 'active', 'disabled', 'suspended'
reader_states = {
    1: {'status': 'active', 'suspended_until': 0},
    2: {'status': 'active', 'suspended_until': 0},
    3: {'status': 'active', 'suspended_until': 0}
}

if IS_LINUX:
    try:
        import spidev
        import RPi.GPIO as GPIO
        from mfrc522 import MFRC522

        # SPI Setup
        spi = spidev.SpiDev()
        spi.open(0, 0)
        spi.max_speed_hz = 1000000  # SPI clock: 1 MHz

        # GPIO Setup
        GPIO.setmode(GPIO.BCM)
        for pin in buffer_pins:
            GPIO.setup(pin, GPIO.OUT)
            GPIO.output(pin, GPIO.HIGH)  # Buffer disabled initially
            
        # Button Setup (Active High -> Pull Down)
        GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

        # Initialize Readers (instansiasi 3 pembaca RFID)
        for pin in buffer_pins:
            reader = MFRC522(spi, GPIO, pin)
            readers.append({'id': pin, 'driver': reader})
            
    except ImportError as e:
        print(f"Failed to load hardware libs: {e}")
        IS_LINUX = False  # Fallback ke mock hardware
```

**Penjelasan:**
- **GPIO Setup**: Menetapkan mode BCM (Broadcom) dan mengkonfigurasi 3 pin buffer (GPIO 17, 27, 22) sebagai output
- **SPI Setup**: Membuka bus SPI 0 device 0 dengan kecepatan 1 MHz untuk komunikasi dengan sensor RFID
- **Push Button**: Dikonfigurasi sebagai input dengan pull-down resistor (active high)
- **Reader States**: Struktur data untuk mengelola status setiap pembaca (aktif, dinonaktifkan, atau ditunda)

---

## 2. LOGIKA MULTIPLEXING BUFFER (74HC125)

### 2.1 Kontrol Output Enable pada IC 74HC125

**File:** `backend-py/mfrc522.py` (Baris 86-111)

```python
def write_register(self, addr, val):
    """
    Menulis ke register MFRC522 dengan kontrol buffer.
    IC 74HC125 menggunakan active-low /OE (Output Enable).
    """
    address = (addr << 1) & 0x7E
    
    # Enable Buffer (Active Low) - Aktifkan pembaca ini
    self.GPIO.output(self.buffer_pin, self.GPIO.LOW)
    
    # SPI Transfer - Kirim data ke MFRC522
    self.spi.xfer2([address, val])
    
    # Disable Buffer (Active High) - Matikan pembaca ini (cegah collision)
    self.GPIO.output(self.buffer_pin, self.GPIO.HIGH)

def read_register(self, addr):
    """
    Membaca dari register MFRC522 dengan kontrol buffer.
    Mencegah data collision dengan mengaktifkan hanya 1 pembaca pada saat tertentu.
    """
    address = (addr << 1) | 0x80
    
    # Enable Buffer - Aktifkan pembaca ini saja
    self.GPIO.output(self.buffer_pin, self.GPIO.LOW)
    
    # Read: Send Address then Dummy Byte (Baca data dari MISO)
    response = self.spi.xfer2([address, 0x00])
    
    # Disable Buffer - Matikan pembaca untuk mencegah interference
    self.GPIO.output(self.buffer_pin, self.GPIO.HIGH)
    
    return response[1]  # Return byte dari MISO
```

**Penjelasan Multiplexing:**
- **Active Low Logic**: /OE adalah active-low (LOW = enabled, HIGH = disabled)
- **Read-Write Sequence**: Setiap operasi register dimulai dengan enable buffer, lalu transfer SPI, kemudian disable buffer
- **Data Collision Prevention**: Hanya satu pembaca yang dapat berkomunikasi dengan MFRC522 pada saat bersamaan
- **Sequential Addressing**: Polling loop dalam `rfid_loop()` membaca pembaca secara bergantian

### 2.2 Inisialisasi MFRC522 dengan Buffer Control

**File:** `backend-py/mfrc522.py` (Baris 75-85)

```python
class MFRC522:
    def __init__(self, spi, gpio_module, buffer_pin):
        self.spi = spi
        self.GPIO = gpio_module
        self.buffer_pin = buffer_pin
        
        # Ensure Buffer is Disabled (High) initially
        self.GPIO.output(self.buffer_pin, self.GPIO.HIGH)
        
        self.init()  # Inisialisasi MFRC522
```

---

## 3. KOMUNIKASI REAL-TIME (Backend - Flask-SocketIO)

### 3.1 Polling Loop dan Pemancaran UID via WebSocket

**File:** `backend-py/app.py` (Baris 73-140)

```python
# --- Polling Loop ---
def rfid_loop():
    """
    Loop utama yang melakukan polling sensor RFID dan push button.
    Mengirim event ke frontend via WebSocket (SocketIO).
    """
    print("Starting RFID Polling Loop...")
    last_button_state = GPIO.LOW
    
    while True:
        try:
            current_time = time.time() * 1000  # Waktu dalam ms
            
            # --- CHECK BUTTON ---
            button_state = GPIO.input(BUTTON_PIN)
            if button_state == GPIO.HIGH and last_button_state == GPIO.LOW:
                print("[Button] Pressed! Emitting game-start")
                socketio.emit('game-start')  # Emit ke semua klien yang terhubung
                eventlet.sleep(0.5)  # Debounce delay
            
            last_button_state = button_state
            
            # --- POLLING 3 SENSOR RFID SECARA BERGANTIAN ---
            for i, r in enumerate(readers):
                # Map GPIO Pin ke Logic ID (1, 2, 3)
                reader_logic_id = i + 1
                
                # --- CHECK STATE ---
                state = reader_states.get(reader_logic_id, {'status': 'active'})
                
                if state['status'] == 'disabled':
                    # Skip reading - reader sudah menemukan kartu yang benar
                    continue
                
                if state['status'] == 'suspended':
                    if current_time < state['suspended_until']:
                        # Still suspended - kartu yang ditempel salah, tunggu
                        continue
                    else:
                        # Suspension over, auto-reset to active
                        print(f"[Reader {reader_logic_id}] Suspension ended. Reactivating.")
                        reader_states[reader_logic_id]['status'] = 'active'
                        reader_states[reader_logic_id]['suspended_until'] = 0
                
                # --- READ CARD FROM RFID SENSOR ---
                card = None
                if hasattr(r['driver'], 'find_card'):
                    card = r['driver'].find_card()
                
                if card:
                    # Extract UID dan format sebagai hex string
                    uid_raw = card['uid']
                    uid_str = ":".join([f"{x:02X}" for x in uid_raw])
                    print(f"[Reader {reader_logic_id} (GPIO {r['id']})] Card Found: {uid_str}")
                    
                    # Emit event ke frontend
                    socketio.emit('rfid-tag', {
                        'readerId': reader_logic_id,      # 1, 2, atau 3
                        'uid': uid_str,                    # Format: "3D:1E:71:05"
                        'timestamp': time.time() * 1000
                    })
                    
            eventlet.sleep(0.1)  # Yield to event loop
            
        except Exception as e:
            print(f"Loop Error: {e}")
            eventlet.sleep(1)

# Jalankan polling loop di background
socketio.start_background_task(rfid_loop)
socketio.run(app, host='0.0.0.0', port=3001)
```

**Penjelasan:**
- **Debouncing**: Mendeteksi transisi tombol dari LOW ke HIGH (rising edge)
- **State Management**: Setiap pembaca memiliki status (active/disabled/suspended) untuk kontrol logika permainan
- **Multiplexing Poll**: Loop iterasi melalui 3 pembaca secara berurutan, membaca masing-masing saat active
- **SocketIO Emit**: Mengirim data UID ke frontend dengan readerId dan timestamp

### 3.2 Handler WebSocket untuk Kontrol Reader dari Frontend

**File:** `backend-py/app.py` (Baris 142-170)

```python
# --- Socket Events for Control ---

@socketio.on('disable_reader')
def handle_disable_reader(data):
    """
    Menonaktifkan reader secara permanen setelah jawaban benar.
    Frontend mengirim event ini setelah user menjawab benar.
    """
    r_id = data.get('readerId')
    if r_id in reader_states:
        print(f"[Command] Disabling Reader {r_id}")
        reader_states[r_id]['status'] = 'disabled'

@socketio.on('suspend_reader')
def handle_suspend_reader(data):
    """
    Menangguhkan reader sementara setelah jawaban salah.
    Mencegah scan yang berulang-ulang dalam waktu singkat.
    """
    r_id = data.get('readerId')
    duration = data.get('duration', 4000)  # Default: 4 detik
    
    if r_id in reader_states:
        until = (time.time() * 1000) + duration
        print(f"[Command] Suspending Reader {r_id} for {duration}ms")
        reader_states[r_id]['status'] = 'suspended'
        reader_states[r_id]['suspended_until'] = until

@socketio.on('reset_all_readers')
def handle_reset_all():
    """
    Me-reset semua reader ke status 'active'.
    Dipanggil pada awal permainan atau transisi antar sesi.
    """
    print("[Command] Resetting ALL Readers to Active")
    for r_id in reader_states:
        reader_states[r_id]['status'] = 'active'
        reader_states[r_id]['suspended_until'] = 0

@socketio.on('connect')
def test_connect():
    print('Frontend connected')
```

---

## 4. PENERIMAAN DATA & VALIDASI (Frontend - Next.js)

### 4.1 Inisialisasi Game dan Koneksi WebSocket

**File:** `app/game/page.tsx` (Baris 1-50)

```typescript
'use client';
import { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';

// Define structure untuk Level/Question Data
type LevelItem = {
    id: string;
    session: number;           // 1, 2, atau 3
    slotId: number;            // 1, 2, atau 3 (Maps ke RFID Reader ID)
    name: string;
    iconImage: string;
    correctCardId: string;    // Format: "3D:1E:71:05"
    videoSrc: string;
    color: string;
};

// Pool pertanyaan - akan di-shuffle dan di-assign ke session
const QUESTION_POOL: QuestionItem[] = [
    {
        id: "q1",
        name: "Dilarang parkir",
        iconImage: "/images/rambu_dilarang_parkir.png",
        correctCardId: "3D:1E:71:05",  // UID kartu RFID yang benar untuk soal ini
        videoSrc: "/videos/Rambu_dilarang_parkir.mp4",
        color: "from-red-400 to-red-600",
    },
    {
        id: "q2",
        name: "Bus Stop",
        iconImage: "/images/rambu_bus_stop.png",
        correctCardId: "01:CC:9E:5D",
        videoSrc: "/videos/Rambu_bus_stop.mp4",
        color: "from-orange-400 to-orange-600",
    },
    // ... (9 pertanyaan total)
];

export default function GamePage() {
    // --- STATE MANAGEMENT ---
    const [gameLevels, setGameLevels] = useState<LevelItem[]>([]);
    const [isGameReady, setIsGameReady] = useState(false);
    const [currentSession, setCurrentSession] = useState<number>(1);
    const [gameState, setGameState] = useState<'playing' | 'celebration' | 'reward_sequence' | 'finished'>('playing');
    
    // Status slot untuk session saat ini (idle/correct/wrong)
    const [slotsStatus, setSlotsStatus] = useState<Record<number, SlotStatus>>({
        1: 'idle',
        2: 'idle',
        3: 'idle'
    });
```

### 4.2 Koneksi WebSocket dan Penerimaan Event RFID

**File:** `app/game/page.tsx` (Baris 178-216)

```typescript
useEffect(() => {
    if (!isGameReady) return;
    
    // --- RFID Socket Connection ---
    const socket = io('http://localhost:3001');
    
    socket.on('connect', () => {
        console.log('Game Page Connected to RFID Backend');
        // Reset all readers pada awal game
        socket.emit('reset_all_readers');
    });
    
    // Event dari push button di Raspberry Pi
    socket.on('game-start', () => {
        console.log('Game Page RFID Event: game-start');
        if (gameStateRef.current === 'finished') {
            window.location.reload();
        }
    });
    
    // Event utama: Kartu RFID terdeteksi
    socket.on('rfid-tag', (data: { readerId: number; uid: string }) => {
        console.log('Game Page RFID Event:', data);
        
        // Cari pertanyaan di session saat ini yang match dengan readerId
        const currentSessionItems = gameLevels.filter(
            item => item.session === currentSession
        );
        const targetItem = currentSessionItems.find(
            item => item.slotId === data.readerId
        );
        
        if (targetItem) {
            // Proses pemindaian dengan socket reference
            handleRFIDScan(data.readerId, data.uid, socket);
        }
    });
    
    return () => {
        socket.disconnect();
    };
}, [currentSession, isGameReady, gameLevels]);
```

**Penjelasan:**
- **Socket Connection**: Menghubungkan ke backend Flask-SocketIO di port 3001
- **Event Listeners**: Mendengarkan event 'rfid-tag' yang dipancarkan backend
- **readerId Mapping**: Mencocokkan readerId (1-3) dengan slotId pertanyaan di session saat ini

### 4.3 Validasi UID dan Trigger Status (Benar/Salah)

**File:** `app/game/page.tsx` (Baris 256-305)

```typescript
// --- LOGIKA SCAN RFID ---
const handleRFIDScan = (slotId: number, scannedCardId: string, socket?: any) => {
    // Jangan proses jika bukan dalam state 'playing'
    if (gameState !== 'playing') return;
    
    // Jangan proses jika slot sudah dijawab dengan benar
    if (slotsStatus[slotId] === 'correct') return;
    
    // Get pertanyaan untuk slot ini di session saat ini
    const currentSessionItems = gameLevels.filter(
        item => item.session === currentSession
    );
    const targetData = currentSessionItems.find(d => d.slotId === slotId);
    
    // Safety check
    if (!targetData) return;
    
    // === VALIDASI: Cocokkan UID dengan kunci jawaban ===
    if (scannedCardId === targetData.correctCardId) {
        // ✓ JAWABAN BENAR
        playAudio(AUDIO_CORRECT);
        
        // Update status slot menjadi 'correct'
        setSlotsStatus(prev => ({
            ...prev,
            [slotId]: 'correct'
        }));
        
        // Tampilkan feedback visual selama 3 detik
        setFeedbackSlot({ id: slotId, type: 'correct' });
        
        // Disable reader ini di backend agar tidak bisa scan ulang
        if (socket) {
            socket.emit('disable_reader', { readerId: slotId });
        } else {
            const tempSocket = io('http://localhost:3001');
            tempSocket.emit('disable_reader', { readerId: slotId });
        }
        
    } else {
        // ✗ JAWABAN SALAH
        playAudio(AUDIO_WRONG);
        
        // Update status slot menjadi 'wrong'
        setSlotsStatus(prev => ({
            ...prev,
            [slotId]: 'wrong'
        }));
        
        // Tampilkan feedback visual selama 3 detik
        setFeedbackSlot({ id: slotId, type: 'wrong' });
        
        // Suspend reader ini selama 4 detik (debounce)
        if (socket) {
            socket.emit('suspend_reader', {
                readerId: slotId,
                duration: 4000
            });
        } else {
            const tempSocket = io('http://localhost:3001');
            tempSocket.emit('suspend_reader', {
                readerId: slotId,
                duration: 4000
            });
        }
    }
};
```

**Penjelasan Validasi:**
- **String Matching**: Membandingkan `scannedCardId` dengan `targetData.correctCardId` secara string
- **State Update**: Mengubah status slot menjadi 'correct' atau 'wrong'
- **Feedback Trigger**: Menampilkan visual feedback (checkmark/X) dan audio
- **Backend Command**: Mengirim command ke backend untuk disable/suspend reader

### 4.4 Logika Deteksi Semua Jawaban Benar (Per Sesi)

**File:** `app/game/page.tsx` (Baris 228-242)

```typescript
// --- LOGIKA CEK KONDISI MENANG (PER SESI) ---
useEffect(() => {
    if (!isGameReady || currentSessionData.length === 0) return;
    
    // Cek apakah semua 3 slot di session saat ini sudah 'correct'
    const allCorrect = currentSessionData.every(
        item => slotsStatus[item.slotId] === 'correct'
    );
    
    if (allCorrect && gameState === 'playing') {
        // Semua jawaban di sesi ini benar!
        const timer = setTimeout(() => {
            playAudio(AUDIO_CELEBRATION);
            setGameState('celebration');  // Tampilkan screen "HEBAT!"
        }, 2000);
        return () => clearTimeout(timer);
    }
}, [slotsStatus, gameState, currentSessionData, isGameReady]);
```

**Flow Game State:**
1. **'playing'** → User menjawab semua 3 pertanyaan dengan benar
2. **'celebration'** → Tampilkan "HEBAT! Semua Jawaban Benar!" selama 4 detik
3. **'reward_sequence'** → Putar 3 video penjelasan
4. Jika ada session lagi → Kembali ke 'playing'
5. **'finished'** → Tampilkan "LUAR BIASA! Semua Sesi Selesai!"

### 4.5 Transisi Antar Sesi

**File:** `app/game/page.tsx` (Baris 318-334)

```typescript
const handleSessionComplete = () => {
    // Reset semua reader untuk session berikutnya
    const socket = io('http://localhost:3001');
    socket.emit('reset_all_readers');
    
    if (currentSession < 3) {
        // Ada session berikutnya
        setCurrentSession(prev => prev + 1);
        
        // Reset slot status ke idle untuk session baru
        setSlotsStatus({ 1: 'idle', 2: 'idle', 3: 'idle' });
        setGameState('playing');
        playAudio(AUDIO_START);
        
    } else {
        // Semua 3 session sudah selesai
        setGameState('finished');
    }
};
```

---

## RINGKASAN ALUR KOMUNIKASI SISTEM

```
[Raspberry Pi Hardware] 
    ↓
[Push Button → GPIO 6]    [RFID Sensor 1 → GPIO 17]
                          [RFID Sensor 2 → GPIO 27]
                          [RFID Sensor 3 → GPIO 22]
    ↓
[Python Backend - app.py]
    ├─ rfid_loop() polling 3 sensor secara bergantian
    ├─ Multiplexing via IC 74HC125 (/OE per GPIO)
    └─ Emit 'rfid-tag' via SocketIO
    ↓
[Next.js Frontend - game/page.tsx]
    ├─ Terima 'rfid-tag' event
    ├─ Validasi UID dengan correctCardId
    ├─ Update slotsStatus (correct/wrong/idle)
    └─ Emit 'disable_reader' / 'suspend_reader'
    ↓
[Backend State Management]
    └─ Kontrol reader status untuk game logic
```

---

## CATATAN IMPLEMENTASI

1. **Multiplexing Strategy**: Menggunakan IC 74HC125 sebagai tri-state buffer dengan kontrol /OE per pin GPIO untuk mencegah SPI collision
2. **State Management Backend**: Setiap reader memiliki status (active/disabled/suspended) untuk mengontrol availability dalam game
3. **Real-time Communication**: Flask-SocketIO memungkinkan komunikasi 2-arah (backend → frontend untuk events, frontend → backend untuk commands)
4. **Validation Logic**: String matching sederhana namun efektif untuk mencocokkan UID dengan jawaban
5. **Debouncing**: Menggunakan suspension untuk mencegah double-scan dalam waktu singkat
6. **Game State Machine**: 4 state utama (playing → celebration → reward_sequence → finished) dengan transisi antar sesi

