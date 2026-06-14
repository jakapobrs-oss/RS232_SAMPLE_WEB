# RS232_SAMPLE_WEB — LG TV RS232 Controller (Web command)

หน้าเว็บ **command UI** สำหรับสั่งงานทีวี LG ผ่าน RS232 — รันบนเบราว์เซอร์ desktop ได้เลย
ผ่าน **Web Serial API** (Chrome/Edge) โดยไม่ต้องมีแอป/มือถือ

> คู่กับ repo **RS232_SAMPLE_APP** (เอาหน้าเว็บชุดนี้ไปฝังใน Android WebView + ต่อ USB-serial บนมือถือ/Android TV)

## ไฟล์

```
index.html            ← หน้าจอ + ปุ่มควบคุม
app.js                ← logic: ประกอบคำสั่ง LG, จัดการสถานะ, รับ-ส่ง serial
styles.css            ← สไตล์
serial-web-shim.js    ← สะพานไป Web Serial API (เลียน interface AndroidSerial ของฝั่งแอป)
lib/fontawesome/      ← ไอคอน
command/                ← สคริปต์เทสโปรโตคอลเฟส 1 (ดู command/README.md)
```

## วิธีรัน (สำคัญ: ต้องเสิร์ฟผ่าน localhost)

Web Serial API ทำงานเฉพาะใน **secure context** — เปิดไฟล์ `index.html` แบบ `file://` ตรงๆ **ใช้ไม่ได้**
ต้องเสิร์ฟผ่าน `http://localhost` หรือ `https://`:

```bash
# วิธีที่ง่ายสุด (มี Python อยู่แล้ว)
python -m http.server 8000
# แล้วเปิด  http://localhost:8000  ใน Chrome หรือ Edge (desktop)

# หรือใช้ Node
npx serve .
```

จากนั้น: กด **Connect** → เบราว์เซอร์จะให้เลือก COM port (เช่น CH340) → เลือกแล้วใช้งานได้เลย
ปุ่มต่างๆ: Power, Volume, Mute, เปลี่ยน Input, รีโมตเสมือน, ช่องพิมพ์คำสั่งเอง

> ต้องต่อ **USB-to-RS232 → ช่อง RS-232C ของ TV** เข้ากับเครื่อง notebook ก่อน
> อยากพิสูจน์ฮาร์ดแวร์/โปรโตคอลก่อนเปิดเว็บ ใช้ `command/Test-LgTv.ps1` ได้

## สะพาน serial (contract เดียวกับฝั่งแอป)

- เว็บเรียก: `AndroidSerial.connect(baud)` / `.send(data)` / `.disconnect()`
- เรียกกลับ: `window.onSerialConnected(ok,msg)` / `onSerialDataReceived(str)` / `onSerialDisconnected()`

บนเบราว์เซอร์ `serial-web-shim.js` ทำหน้าที่ `AndroidSerial` ให้ผ่าน Web Serial API
ส่วนบน Android ตัว native bridge ถูก inject ก่อน → shim กลายเป็น no-op อัตโนมัติ
**โค้ดเว็บชุดนี้จึงรันได้ทั้งเบราว์เซอร์และในแอป โดยไม่ต้องแก้อะไร**

## ⚠️ www ซ้ำกับ RS232_SAMPLE_APP

ไฟล์ชุดนี้ถูก **สำเนา** ไปฝังใน RS232_SAMPLE_APP ที่ `app/src/main/assets/www/` (เพื่อให้แอปรัน offline ได้)
**แก้ที่ฝั่งไหน อย่าลืม sync อีกฝั่ง** ไม่งั้นสองที่จะเพี้ยนกัน (drift)

## โปรโตคอล LG (อ้างอิงเร็ว)

- พอร์ต: **9600 bps, 8N1, no flow control**
- คำสั่ง: `[cmd] [SetID] [Data]` เช่น `ka 01 FF` (ถาม power)
- `ka` power · `kf` volume (00–64 hex) · `ke` mute · `xb` input · `mc` ปุ่มรีโมต
- ตอบ: `a 01 OK01x` = สำเร็จ / `NG` = ไม่รับคำสั่ง
