import eventlet
eventlet.monkey_patch()

from flask import Flask
from flask_socketio import SocketIO
import threading
import time
import platform

app = Flask(__name__)
# Allow CORS for dev
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# --- Hardware Setup ---
IS_LINUX = platform.system() == 'Linux'
print(f"Running on Platform: {platform.system()}")

readers = []
buffer_pins = [17, 27, 22] //rfid reader GPIO 
BUTTON_PIN = 6 //button GPIO

# --- Reader State Management ---
# States: 'active', 'disabled', 'suspended'
# suspended_until: timestamp (float) or 0
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
        spi.max_speed_hz = 1000000

        # GPIO Setup
        GPIO.setmode(GPIO.BCM)
        for pin in buffer_pins:
            GPIO.setup(pin, GPIO.OUT)
            GPIO.output(pin, GPIO.HIGH) # Disabled initially
            
        # Button Setup (Active High -> Pull Down)
        GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

        # Init Readers
        for pin in buffer_pins:
            reader = MFRC522(spi, GPIO, pin)
            readers.append({'id': pin, 'driver': reader})
            
    except ImportError as e:
        print(f"Failed to load hardware libs: {e}")
        IS_LINUX = False # Fallback

if not IS_LINUX:
    print("Using Mock Hardware Mode")
    from mock_hardware import MockMFRC522, MockSPI, MockGPIO
    spi = MockSPI()
    GPIO = MockGPIO()
    
    for pin in buffer_pins:
        reader = MockMFRC522(spi, GPIO, pin)
        readers.append({'id': pin, 'driver': reader})
        
    # Mock Button Setup
    GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

# --- Polling Loop ---
def rfid_loop():
    print("Starting RFID Polling Loop...")
    last_button_state = GPIO.LOW
    
    while True:
        try:
            current_time = time.time() * 1000 # ms

            # --- CHECK BUTTON ---
            # Active High: Pressed = HIGH
            button_state = GPIO.input(BUTTON_PIN)
            if button_state == GPIO.HIGH and last_button_state == GPIO.LOW:
                print("[Button] Pressed! Emitting game-start")
                socketio.emit('game-start')
                eventlet.sleep(0.5) # Debounce delay
            
            last_button_state = button_state

            for i, r in enumerate(readers):
                # Map GPIO Pin to Logic ID (1, 2, 3)
                # 17->1, 27->2, 22->3 (based on order in list)
                reader_logic_id = i + 1 
                
                # --- CHECK STATE ---
                state = reader_states.get(reader_logic_id, {'status': 'active'})
                
                if state['status'] == 'disabled':
                    # Skip reading (benar tidak bisa digunakan)
                    continue
                
                if state['status'] == 'suspended':
                    if current_time < state['suspended_until']:
                        # Still suspended
                        continue
                    else:
                        # Suspension over, auto-reset to active
                        print(f"[Reader {reader_logic_id}] Suspension ended. Reactivating.")
                        reader_states[reader_logic_id]['status'] = 'active'
                        reader_states[reader_logic_id]['suspended_until'] = 0

                # --- READ CARD ---
                # Check for card
                # In real MFRC522 we'd call request + anticoll
                # Our mock or wrapper returns dict or None
                card = None
                if hasattr(r['driver'], 'find_card'):
                   card = r['driver'].find_card()
                elif hasattr(r['driver'], 'request'):
                   # Handle raw MFRC522 class usage if needed
                   pass

                if card:
                    uid_raw = card['uid']
                    uid_str = ":".join([f"{x:02X}" for x in uid_raw])
                    print(f"[Reader {reader_logic_id} (GPIO {r['id']})] Card Found: {uid_str}")
                    
                    socketio.emit('rfid-tag', {
                        'readerId': reader_logic_id,
                        'uid': uid_str,
                        'timestamp': time.time() * 1000
                    })
                    
            eventlet.sleep(0.1) # Yield to event loop
            
        except Exception as e:
            print(f"Loop Error: {e}")
            eventlet.sleep(1)

# --- Socket Events for Control ---

@socketio.on('disable_reader')
def handle_disable_reader(data):
    # data: { readerId: number }
    r_id = data.get('readerId')
    if r_id in reader_states:
        print(f"[Command] Disabling Reader {r_id}")
        reader_states[r_id]['status'] = 'disabled'

@socketio.on('suspend_reader')
def handle_suspend_reader(data):
    # data: { readerId: number, duration: number (ms) }
    r_id = data.get('readerId')
    duration = data.get('duration', 4000)
    
    if r_id in reader_states:
        until = (time.time() * 1000) + duration
        print(f"[Command] Suspending Reader {r_id} for {duration}ms")
        reader_states[r_id]['status'] = 'suspended'
        reader_states[r_id]['suspended_until'] = until

@socketio.on('reset_all_readers')
def handle_reset_all():
    print("[Command] Resetting ALL Readers to Active")
    for r_id in reader_states:
        reader_states[r_id]['status'] = 'active'
        reader_states[r_id]['suspended_until'] = 0

@app.route('/')
def index():
    return "RFID Backend Running (Python/Flask)"

@socketio.on('connect')
def test_connect():
    print('Frontend connected')

if __name__ == '__main__':
    # Run on port 3001 to match frontend expectation
    socketio.start_background_task(rfid_loop)
    socketio.run(app, host='0.0.0.0', port=3001)