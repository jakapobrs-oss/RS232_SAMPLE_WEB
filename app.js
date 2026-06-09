// LG TV RS232 Hybrid App Controller (Android WebView Bridge)
// Protocol format: [Command1][Command2][ ][Set ID][ ][Data][Cr]
// Response format: [Command2][ ][Set ID][ ][OK/NG][Data][x]

// --- State Variables ---
let isConnected = false;
let isMockMode = false;
let receiveBuffer = '';

// --- DOM Elements ---
const el = {
  errorBanner: document.getElementById('errorBanner'),
  statusBadge: document.getElementById('statusBadge'),
  statusIndicator: document.getElementById('statusIndicator'),
  statusText: document.getElementById('statusText'),
  baudRate: document.getElementById('baudRate'),
  setId: document.getElementById('setId'),
  btnConnect: document.getElementById('btnConnect'),
  btnDisconnect: document.getElementById('btnDisconnect'),
  btnMockMode: document.getElementById('btnMockMode'),
  
  btnPowerOn: document.getElementById('btnPowerOn'),
  btnPowerOff: document.getElementById('btnPowerOff'),
  volumeSlider: document.getElementById('volumeSlider'),
  volumeValue: document.getElementById('volumeValue'),
  btnVolUp: document.getElementById('btnVolDown'), // Fixed ids based on original HTML
  btnVolDown: document.getElementById('btnVolUp'), 
  btnMuteToggle: document.getElementById('btnMuteToggle'),
  
  btnInputs: document.querySelectorAll('.btn-input'),
  btnIrs: document.querySelectorAll('.btn-ir'),
  
  consoleLog: document.getElementById('consoleLog'),
  btnClearLog: document.getElementById('btnClearLog'),
  rawCommandInput: document.getElementById('rawCommandInput'),
  btnSendCommand: document.getElementById('btnSendCommand'),
  
  allControls: []
};

const btnVolMinus = document.getElementById('btnVolDown');
const btnVolPlus = document.getElementById('btnVolUp');

document.querySelectorAll('button:not(#btnConnect):not(#btnMockMode):not(#btnClearLog), input[type=range], #rawCommandInput').forEach(element => {
  el.allControls.push(element);
});

// --- Initialization ---
function init() {
  if (!window.AndroidSerial) {
    log('WARN', 'AndroidSerial interface not found. Running in browser mode?', 'log-error');
  } else {
    log('INFO', 'Android Native Bridge ready.', 'log-info');
  }

  // Event Listeners
  el.btnConnect.addEventListener('click', connectPort);
  el.btnDisconnect.addEventListener('click', disconnectPort);
  el.btnMockMode.addEventListener('click', toggleMockMode);
  
  el.btnClearLog.addEventListener('click', () => {
    el.consoleLog.innerHTML = '';
    log('INFO', 'Log cleared.', 'log-info');
  });

  // Power
  el.btnPowerOn.addEventListener('click', () => sendCommand('ka', '01'));
  el.btnPowerOff.addEventListener('click', () => sendCommand('ka', '00'));

  // Volume
  el.volumeSlider.addEventListener('change', (e) => {
    const decVal = parseInt(e.target.value, 10);
    const hexVal = decToHex(decVal);
    el.volumeValue.textContent = decVal;
    sendCommand('kf', hexVal);
  });
  el.volumeSlider.addEventListener('input', (e) => {
    el.volumeValue.textContent = e.target.value;
  });
  
  btnVolPlus.addEventListener('click', () => sendCommand('mc', '02'));
  btnVolMinus.addEventListener('click', () => sendCommand('mc', '03'));
  
  // Mute
  let isMuted = false;
  el.btnMuteToggle.addEventListener('click', () => {
    isMuted = !isMuted;
    sendCommand('ke', isMuted ? '00' : '01');
  });

  // Input Selection
  el.btnInputs.forEach(btn => {
    btn.addEventListener('click', () => {
      sendCommand('xb', btn.getAttribute('data-hex'));
    });
  });

  // Virtual Remote (IR Emulation)
  el.btnIrs.forEach(btn => {
    btn.addEventListener('click', () => {
      sendCommand('mc', btn.getAttribute('data-hex'));
    });
  });

  // Raw Command
  el.btnSendCommand.addEventListener('click', sendRawCommand);
  el.rawCommandInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendRawCommand();
  });
}

// --- Connection Logic (Android Bridge) ---
function connectPort() {
  if (isMockMode) toggleMockMode();
  
  const baudRate = parseInt(el.baudRate.value, 10);
  log('INFO', `Requesting connection to Android USB at ${baudRate} bps...`, 'log-info');
  
  if (window.AndroidSerial) {
    window.AndroidSerial.connect(baudRate);
  } else {
    log('ERROR', 'Not running inside Android App.', 'log-error');
  }
}

function disconnectPort() {
  if (!isConnected) return;
  
  if (window.AndroidSerial) {
    window.AndroidSerial.disconnect();
  }
}

// --- Android Callbacks ---
window.onSerialConnected = function(success, message) {
  if (success) {
    isConnected = true;
    updateUIState(true);
    log('INFO', message, 'log-info');
    
    // Query Power Status after connection
    setTimeout(() => {
      sendCommand('ka', 'FF');
    }, 500);
  } else {
    isConnected = false;
    updateUIState(false);
    log('ERROR', message, 'log-error');
  }
};

window.onSerialDisconnected = function() {
  isConnected = false;
  updateUIState(false);
  log('INFO', 'Disconnected from USB port.', 'log-info');
};

window.onSerialDataReceived = function(dataStr) {
  if (!isConnected) return;
  receiveBuffer += dataStr;
  
  let xIndex;
  while ((xIndex = receiveBuffer.indexOf('x')) !== -1) {
    const message = receiveBuffer.substring(0, xIndex + 1).trim();
    receiveBuffer = receiveBuffer.substring(xIndex + 1);
    if (message) {
      handleResponse(message);
    }
  }
};

function toggleMockMode() {
  if (isConnected && !isMockMode) {
    log('ERROR', 'Please disconnect real port before enabling mock mode.', 'log-error');
    return;
  }
  
  isMockMode = !isMockMode;
  
  if (isMockMode) {
    el.btnMockMode.classList.add('active');
    el.btnMockMode.innerHTML = '<i class="fas fa-vial"></i> Mock Mode Active';
    updateUIState(true);
    log('INFO', 'Mock Mode Enabled. Commands will be simulated locally.', 'log-info');
  } else {
    el.btnMockMode.classList.remove('active');
    el.btnMockMode.innerHTML = '<i class="fas fa-flask"></i> Enable Mock Mode';
    updateUIState(false);
    log('INFO', 'Mock Mode Disabled.', 'log-info');
  }
}

function updateUIState(active) {
  el.statusIndicator.className = 'status-indicator ' + (active ? 'connected' : '');
  el.statusText.className = 'status-text ' + (active ? 'connected' : '');
  el.statusText.textContent = active ? (isMockMode ? 'Mocking' : 'Connected') : 'Disconnected';
  
  el.btnConnect.disabled = active;
  el.baudRate.disabled = active;
  el.btnDisconnect.disabled = !active;
  
  el.allControls.forEach(ctrl => {
    ctrl.disabled = !active;
  });
}

// --- Serial Write (Android Bridge) ---
function sendCommand(cmdCode, hexData) {
  let setIdVal = parseInt(el.setId.value, 10);
  if (isNaN(setIdVal) || setIdVal < 0 || setIdVal > 99) setIdVal = 1;
  const setIdHex = decToHex(setIdVal);
  
  const fullCmd = `${cmdCode} ${setIdHex} ${hexData}`;
  const fullCmdWithCr = `${fullCmd}\r`;
  
  if (isMockMode) {
    log('TX', fullCmd, 'log-tx');
    simulateResponse(cmdCode, setIdHex, hexData);
    return;
  }
  
  if (!isConnected) {
    log('ERROR', 'Port not connected.', 'log-error');
    return;
  }
  
  if (window.AndroidSerial) {
    window.AndroidSerial.send(fullCmdWithCr);
    log('TX', fullCmd, 'log-tx');
  }
}

function sendRawCommand() {
  const raw = el.rawCommandInput.value.trim();
  if (!raw) return;
  
  if (isMockMode) {
    log('TX (RAW)', raw, 'log-tx');
    setTimeout(() => log('RX (MOCK)', `${raw.substring(1, 2)} 01 OKFFx`, 'log-rx'), 300);
  } else {
    if (window.AndroidSerial) {
      window.AndroidSerial.send(raw + '\r');
      log('TX', raw, 'log-tx');
    }
  }
  el.rawCommandInput.value = '';
}

// --- Protocol Handling & Simulation ---
function handleResponse(responseStr) {
  log('RX', responseStr, 'log-rx');
  
  const match = responseStr.match(/^([a-z])\s+([0-9a-fA-F]{2})\s+(OK|NG)([0-9a-fA-F]{2,4})x$/i);
  if (match) {
    const cmd2 = match[1].toLowerCase();
    const setId = match[2];
    const status = match[3].toUpperCase();
    const dataHex = match[4];
    
    if (status === 'OK') {
      if (cmd2 === 'f') { // Volume feedback
        const volDec = hexToDec(dataHex);
        el.volumeSlider.value = volDec;
        el.volumeValue.textContent = volDec;
      }
      else if (cmd2 === 'a') { // Power feedback
        if (dataHex === '01') {
          log('INFO', 'TV Power is ON', 'log-info');
        } else if (dataHex === '00') {
          log('INFO', 'TV Power is OFF', 'log-info');
        }
      }
    } else {
      log('ERROR', `TV returned NG (Error) for command ${cmd2}`, 'log-error');
    }
  }
}

function simulateResponse(cmdCode, setId, hexData) {
  setTimeout(() => {
    const cmd2 = cmdCode.charAt(1);
    let resData = hexData;

    // Simulate specific feedbacks for query commands (FF)
    if (hexData.toUpperCase() === 'FF') {
      switch(cmdCode) {
        case 'ka': resData = '01'; break; // Power On
        case 'kf': resData = '32'; break; // Volume 50
        case 'ke': resData = '01'; break; // Mute Off
        case 'xb': resData = '90'; break; // HDMI 1
        default: resData = '01';
      }
    }

    const mockResponse = `${cmd2} ${setId} OK${resData}x`;
    handleResponse(mockResponse);
  }, 400);
}

// --- Utility Functions ---
function log(direction, message, cssClass) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric", fractionalSecondDigits: 3 });
  const entry = document.createElement('div');
  entry.className = `log-entry ${cssClass}`;
  entry.textContent = `[${time}] ${direction}: ${message}`;
  el.consoleLog.appendChild(entry);
  el.consoleLog.scrollTop = el.consoleLog.scrollHeight;
}

function decToHex(dec) {
  let hex = Number(dec).toString(16).toUpperCase();
  if (hex.length < 2) hex = "0" + hex;
  return hex;
}

function hexToDec(hex) {
  return parseInt(hex, 16);
}

// Start
document.addEventListener('DOMContentLoaded', init);
