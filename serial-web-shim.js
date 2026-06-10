// Web Serial shim สำหรับเทสบน notebook (Chrome/Edge) โดยไม่ต้องมีมือถือ:
// เลียนแบบ interface ของ AndroidSerial (connect/disconnect/send) ด้วย Web Serial API
// และเรียก callback ชุดเดียวกับฝั่ง Android (onSerialConnected/onSerialDisconnected/onSerialDataReceived)
// บน Android ตัว native bridge ถูก inject ก่อนสคริปต์นี้รัน ไฟล์นี้จึงเป็น no-op ที่นั่น
(function () {
  'use strict';
  if (window.AndroidSerial) return;

  let port = null;
  let reader = null;
  let keepReading = false;
  let readLoopPromise = null;
  let writeChain = Promise.resolve();

  function notifyConnected(success, message) {
    if (window.onSerialConnected) window.onSerialConnected(success, message);
  }

  async function readLoop() {
    const decoder = new TextDecoder();
    while (keepReading && port && port.readable) {
      reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break; // reader.cancel() จาก disconnect()
          if (value && value.length && window.onSerialDataReceived) {
            window.onSerialDataReceived(decoder.decode(value, { stream: true }));
          }
        }
      } catch (e) {
        // สายหลุด/พอร์ตพัง — แจ้งแบบเดียวกับ onRunError ฝั่ง Android
        keepReading = false;
        try { reader.releaseLock(); } catch (_) {}
        reader = null;
        try { await port.close(); } catch (_) {}
        port = null;
        notifyConnected(false, 'Connection lost: ' + (e && e.message));
        if (window.onSerialDisconnected) window.onSerialDisconnected();
        return;
      }
      try { reader.releaseLock(); } catch (_) {}
      reader = null;
    }
  }

  window.AndroidSerial = {
    isWebShim: true,

    connect: function (baudRate) {
      (async () => {
        try {
          if (!('serial' in navigator)) {
            notifyConnected(false, 'Web Serial API not available — use Chrome/Edge on desktop.');
            return;
          }
          // ต้องถูกเรียกภายใน user gesture (คลิกปุ่ม Connect) ไม่งั้น requestPort จะ reject
          port = await navigator.serial.requestPort();
          await port.open({
            baudRate: Number(baudRate) || 9600,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            flowControl: 'none'
          });
          keepReading = true;
          readLoopPromise = readLoop();
          notifyConnected(true, 'Connected via Web Serial (' + baudRate + ' bps)');
        } catch (e) {
          try { if (port) await port.close(); } catch (_) {}
          port = null;
          notifyConnected(false, 'Error: ' + (e && e.message));
        }
      })();
    },

    disconnect: function () {
      (async () => {
        keepReading = false;
        try { if (reader) await reader.cancel(); } catch (_) {}
        try { if (readLoopPromise) await readLoopPromise; } catch (_) {}
        readLoopPromise = null;
        try { if (port) await port.close(); } catch (_) {}
        port = null;
        if (window.onSerialDisconnected) window.onSerialDisconnected();
      })();
    },

    send: function (data) {
      // เข้าคิวการเขียนกันชน writer lock เมื่อกดปุ่มรัวๆ
      const bytes = new TextEncoder().encode(data);
      writeChain = writeChain.then(async () => {
        if (!port || !port.writable) return;
        const writer = port.writable.getWriter();
        try { await writer.write(bytes); } finally { writer.releaseLock(); }
      }).catch(function (e) { console.error('Serial write failed:', e); });
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.log === 'function') {
      window.log('INFO', 'Web Serial shim active (desktop browser mode) — กด Connect Port แล้วเลือก COM port', 'log-info');
    }
  });
})();
