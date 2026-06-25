import time

# --- Constants ---
PCD_IDLE = 0x00
PCD_AUTHENT = 0x0E
PCD_RECEIVE = 0x08
PCD_TRANSMIT = 0x04
PCD_TRANSCEIVE = 0x0C
PCD_RESETPHASE = 0x0F
PCD_CALCCRC = 0x03

PICC_REQIDL = 0x26
PICC_REQALL = 0x52
PICC_ANTICOLL = 0x93
PICC_SELEC = 0x93
PICC_AUTHENT1A = 0x60
PICC_AUTHENT1B = 0x61
PICC_READ = 0x30
PICC_WRITE = 0xA0
PICC_DECREMENT = 0xC0
PICC_INCREMENT = 0xC1
PICC_RESTORE = 0xC2
PICC_TRANSFER = 0xB0
PICC_HALT = 0x50

MI_OK = 0
MI_NOTAGERR = 1
MI_ERR = 2

# Register definitions
CommandReg = 0x01
CommIEnReg = 0x02
DivlEnReg = 0x03
CommIrqReg = 0x04
DivIrqReg = 0x05
ErrorReg = 0x06
Status1Reg = 0x07
Status2Reg = 0x08
FIFODataReg = 0x09
FIFOLevelReg = 0x0A
WaterLevelReg = 0x0B
ControlReg = 0x0C
BitFramingReg = 0x0D
CollReg = 0x0E
ModeReg = 0x11
TxModeReg = 0x12
RxModeReg = 0x13
TxControlReg = 0x14
TxASKReg = 0x15
TxSelReg = 0x16
RxSelReg = 0x17
RxThresholdReg = 0x18
DemodReg = 0x19
MifareReg = 0x1C
SerialSpeedReg = 0x1F
CRCResultRegM = 0x21
CRCResultRegL = 0x22
ModWidthReg = 0x24
RFCfgReg = 0x26
GsNReg = 0x27
CWGsPReg = 0x28
ModGsPReg = 0x29
TModeReg = 0x2A
TPrescalerReg = 0x2B
TReloadRegH = 0x2C
TReloadRegL = 0x2D
TCounterValueRegH = 0x2E
TCounterValueRegL = 0x2F
TCfgReg = 0x36

# We need access to GPIO for buffer control here.
# Assuming GPIO and spi objects are passed in or imported globally in real context
# But to keep it clean, we'll pass them in init.

class MFRC522:
    def __init__(self, spi, gpio_module, buffer_pin):
        self.spi = spi
        self.GPIO = gpio_module
        self.buffer_pin = buffer_pin
        
        # Ensure Buffer is Disabled (High) initially
        self.GPIO.output(self.buffer_pin, self.GPIO.HIGH)
        
        self.init()

    def write_register(self, addr, val):
        address = (addr << 1) & 0x7E
        
        # Enable Buffer (Active Low)
        self.GPIO.output(self.buffer_pin, self.GPIO.LOW)
        
        # SPI Transfer
        # Python spidev xfer2 sends and receives simultaneously
        self.spi.xfer2([address, val])
        
        # Disable Buffer (Active High)
        self.GPIO.output(self.buffer_pin, self.GPIO.HIGH)

    def read_register(self, addr):
        address = (addr << 1) | 0x80
        
        # Enable Buffer
        self.GPIO.output(self.buffer_pin, self.GPIO.LOW)
        
        # Read: Send Address then Dummy Byte
        response = self.spi.xfer2([address, 0x00])
        
        # Disable Buffer
        self.GPIO.output(self.buffer_pin, self.GPIO.HIGH)
        
        return response[1] # Return the second byte (MISO data)

    def set_register_bit_mask(self, reg, mask):
        tmp = self.read_register(reg)
        self.write_register(reg, tmp | mask)

    def clear_register_bit_mask(self, reg, mask):
        tmp = self.read_register(reg)
        self.write_register(reg, tmp & (~mask))

    def init(self):
        self.reset()
        
        self.write_register(TModeReg, 0x8D)
        self.write_register(TPrescalerReg, 0x3E)
        self.write_register(TReloadRegL, 30)
        self.write_register(TReloadRegH, 0)
        
        self.write_register(TxASKReg, 0x40)
        self.write_register(ModeReg, 0x3D)
        
        self.antenna_on()

    def reset(self):
        self.write_register(CommandReg, PCD_RESETPHASE)

    def antenna_on(self):
        temp = self.read_register(TxControlReg)
        if ~(temp & 0x03):
            self.set_register_bit_mask(TxControlReg, 0x03)

    def find_card(self):
        # 1. Request
        status, _ = self.request(PICC_REQIDL)
        if status != MI_OK:
            return None
            
        # 2. Anticollision
        status, uid = self.anticollision()
        if status != MI_OK:
            return None
            
        return {
            'uid': uid
        }

    def request(self, req_mode):
        self.write_register(BitFramingReg, 0x07)
        tag_type = [req_mode]
        
        status, back_data, back_len = self.to_card(PCD_TRANSCEIVE, tag_type)
        
        if (status != MI_OK) or (back_len != 0x10):
            status = MI_ERR
            
        return status, back_data

    def anticollision(self):
        self.write_register(BitFramingReg, 0x00)
        ser_num = [PICC_ANTICOLL, 0x20]
        
        status, back_data, _ = self.to_card(PCD_TRANSCEIVE, ser_num)
        
        if status == MI_OK:
            if len(back_data) == 5:
                # Check CRC (BCC) here if wanted.
                # back_data contains 4 byte UID + 1 byte BCC
                return MI_OK, back_data[0:4]
        
        return MI_ERR, []

    def to_card(self, command, send_data):
        back_data = []
        back_len = 0
        status = MI_ERR
        irq_en = 0x00
        wait_irq = 0x00

        if command == PCD_AUTHENT:
            irq_en = 0x12
            wait_irq = 0x10
        if command == PCD_TRANSCEIVE:
            irq_en = 0x77
            wait_irq = 0x30

        self.write_register(CommIEnReg, irq_en | 0x80)
        self.clear_register_bit_mask(CommIrqReg, 0x80)
        self.set_register_bit_mask(FIFOLevelReg, 0x80)

        self.write_register(CommandReg, PCD_IDLE)

        # Write data to FIFO
        for byte in send_data:
            self.write_register(FIFODataReg, byte)

        self.write_register(CommandReg, command)
        if command == PCD_TRANSCEIVE:
            self.set_register_bit_mask(BitFramingReg, 0x80)

        # Wait for interrupt
        i = 2000
        while True:
            n = self.read_register(CommIrqReg)
            i -= 1
            if i == 0:
                break
            else:
                if (n & 0x01) and (~(n & 0x02)):
                    # Time out
                    pass
                if n & wait_irq:
                    # Target IRQ
                    break
        
        self.clear_register_bit_mask(BitFramingReg, 0x80)

        if i != 0:
            if (self.read_register(ErrorReg) & 0x1B) == 0x00:
                status = MI_OK
                if n & irq_en & 0x01:
                    status = MI_NOTAGERR
                
                if command == PCD_TRANSCEIVE:
                    n = self.read_register(FIFOLevelReg)
                    last_bits = self.read_register(ControlReg) & 0x07
                    if last_bits != 0:
                        back_len = (n - 1) * 8 + last_bits
                    else:
                        back_len = n * 8
                    
                    if n == 0: n = 1
                    if n > 16: n = 16
                    
                    for _ in range(n):
                        back_data.append(self.read_register(FIFODataReg))
            else:
                status = MI_ERR
        
        return status, back_data, back_len
