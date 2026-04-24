/**
 * ton-connect.js - TON Testnet helpers (COMPLETELY FIXED)
 */

const TON_API_BASE = 'https://testnet.toncenter.com/api/v2';
const TON_API_V3 = 'https://testnet.toncenter.com/api/v3';
const USDT_MASTER = 'EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt';
const TONCENTER_API_KEY = '5c6e93f7e954834555d4f820fd10a51fb8d423fcc2068218babb59f1dcbba0f7';

const HEADERS = {
  'Content-Type': 'application/json',
  'X-API-Key': TONCENTER_API_KEY,
};

let _tonweb;
// function getTonWeb() {
//   if (!_tonweb) {
//     _tonweb = new TonWeb(new TonWeb.HttpProvider('https://testnet.toncenter.com/api/v2', {
//       apiKey: TONCENTER_API_KEY
//     }));
//   }
//   return _tonweb;
// }
function getTonWeb() {
  if (!_tonweb) {
    _tonweb = new TonWeb(new TonWeb.HttpProvider('https://testnet.toncenter.com/api/v2/', {
      //                                                                              ^ add this
      apiKey: TONCENTER_API_KEY
    }));
  }
  return _tonweb;
}

function getCell() {
  return TonWeb.boc.Cell;
}

function bytesToHex(b) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (hex.length % 2) hex = '0' + hex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    out[i / 2] = parseInt(hex.substr(i, 2), 16);
  return out;
}

function shortAddr(addr) {
  if (!addr) return '';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function isValidTonAddress(addr) {
  try {
    new TonWeb.utils.Address(addr);
    return true;
  } catch {
    return false;
  }
}

// FIXED: Robust JSON parsing with better error handling
async function safeJsonResponse(response) {
  try {
    const text = await response.text();
    
    if (!text || text.trim() === '') {
      console.warn('Empty response from API');
      return { ok: false, error: 'Empty response from server' };
    }
    
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('JSON parse error. Raw response:', text.substring(0, 200));
      
      if (text.includes('<html') || text.includes('<!DOCTYPE')) {
        return { ok: false, error: 'API returned HTML error page' };
      }
      
      return { ok: false, error: 'Invalid JSON response' };
    }
  } catch (e) {
    console.error('Failed to read response:', e);
    return { ok: false, error: e.message };
  }
}

async function generateWallet() {
  const n = nacl;
  const kp = n.sign.keyPair();
  const tw = getTonWeb();
  const wallet = tw.wallet.create({
    publicKey: kp.publicKey,
    wc: 0,
    walletVersion: 'v4R2',
  });
  const address = await wallet.getAddress();
  const addrStr = address.toString(true, true, false, true);
  return {
    privateKey: bytesToHex(kp.secretKey),
    publicKey: bytesToHex(kp.publicKey),
    address: addrStr,
  };
}

async function fetchTONBalance(address) {
  try {
    const r = await fetch(`${TON_API_BASE}/getAddressBalance?address=${encodeURIComponent(address)}`, { headers: HEADERS });
    const d = await safeJsonResponse(r);
    if (d.ok && d.result) return (parseInt(d.result) / 1e9).toFixed(4);
  } catch (e) {
    console.error('fetchTONBalance error:', e);
  }
  return '0.0000';
}

// async function fetchSeqno(address) {
//   try {
//     const response = await fetch(`${TON_API_BASE}/runGetMethod`, {
//       method: 'POST',
//       headers: HEADERS,
//       body: JSON.stringify({ 
//         address, 
//         method: 'seqno', 
//         stack: [] 
//       })
//     });
    
//     const data = await safeJsonResponse(response);
    
//     if (!data.ok) {
//       return 0;
//     }
    
//     if (data.result && data.result.stack && data.result.stack[0]) {
//       const val = data.result.stack[0][1];
//       if (typeof val === 'object' && val.num) {
//         return parseInt(val.num, 16);
//       } else if (typeof val === 'string') {
//         return parseInt(val, 16);
//       } else if (typeof val === 'number') {
//         return val;
//       }
//     }
//     return 0;
//   } catch (e) {
//     console.error('fetchSeqno error:', e);
//     return 0;
//   }
// }
async function fetchSeqno(address) {
  try {
    // First check if wallet is initialized
    const infoResp = await fetch(`${TON_API_BASE}/getAddressInformation?address=${encodeURIComponent(address)}`, {
      headers: HEADERS
    });
    const info = await safeJsonResponse(infoResp);
    
    // If uninit, seqno is always 0
    if (!info.ok || info.result?.state === 'uninitialized') {
      return 0;
    }

    const response = await fetch(`${TON_API_BASE}/runGetMethod`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ address, method: 'seqno', stack: [] })
    });
    
    const data = await safeJsonResponse(response);
    if (!data.ok) return 0;
    
    if (data.result?.stack?.[0]) {
      const val = data.result.stack[0][1];
      if (typeof val === 'object' && val.num) return parseInt(val.num, 16);
      if (typeof val === 'string') return parseInt(val, 16);
      if (typeof val === 'number') return val;
    }
    return 0;
  } catch (e) {
    console.error('fetchSeqno error:', e);
    return 0;
  }
}

async function fetchTransactions(address, limit = 20) {
  try {
    const r = await fetch(`${TON_API_BASE}/getTransactions?address=${encodeURIComponent(address)}&limit=${limit}`, { headers: HEADERS });
    const d = await safeJsonResponse(r);
    if (d.ok && d.result) return d.result;
  } catch (e) {
    console.error('fetchTransactions error:', e);
  }
  return [];
}

async function fetchUSDTBalance(address) {
  try {
    const r = await fetch(`${TON_API_V3}/jetton/wallets?owner_address=${encodeURIComponent(address)}&jetton_address=${encodeURIComponent(USDT_MASTER)}&limit=1`, { headers: HEADERS });
    const d = await safeJsonResponse(r);
    if (d.jetton_wallets?.length > 0)
      return (parseInt(d.jetton_wallets[0].balance) / 1e6).toFixed(2);
  } catch (e) {
    console.error('fetchUSDTBalance error:', e);
  }
  return '0.00';
}

async function fetchUSDTTransfers(address, limit = 20) {
  try {
    const r = await fetch(`${TON_API_V3}/jetton/transfers?owner_address=${encodeURIComponent(address)}&jetton_address=${encodeURIComponent(USDT_MASTER)}&limit=${limit}`, { headers: HEADERS });
    const d = await safeJsonResponse(r);
    if (d.jetton_transfers) return d.jetton_transfers;
  } catch (e) {
    console.error('fetchUSDTTransfers error:', e);
  }
  return [];
}

// FIXED: Completely rewritten send function
async function sendTONDirect({ fromAddress, privateKeyHex, toAddress, amountTon, comment = '', _customBody = null }) {
  const n = nacl;
  const secretKey = hexToBytes(privateKeyHex);
  
  let kp;
  if (secretKey.length === 64) {
    const seed = secretKey.slice(0, 32);
    kp = n.sign.keyPair.fromSeed(seed);
  } else if (secretKey.length === 32) {
    kp = n.sign.keyPair.fromSeed(secretKey);
  } else {
    throw new Error(`Invalid private key length: ${secretKey.length}`);
  }

  const tw = getTonWeb();
  
  const wallet = tw.wallet.create({
    publicKey: kp.publicKey,
    wc: 0,
    walletVersion: 'v4R2'
  });

  let seqno = 0;
  let retries = 3;
  while (retries > 0) {
    try {
      seqno = await fetchSeqno(fromAddress);
      break;
    } catch (e) {
      retries--;
      if (retries === 0) throw new Error(`Failed to fetch seqno: ${e.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  // Check wallet is deployed before attempting send
const infoResp = await fetch(`${TON_API_BASE}/getAddressInformation?address=${encodeURIComponent(fromAddress)}`, {
  headers: HEADERS
});
const info = await safeJsonResponse(infoResp);

if (!info.ok || !info.result) {
  throw new Error('Could not fetch wallet state. Check your connection.');
}

const state = info.result.state;
const balance = parseInt(info.result.balance || '0');

if (state === 'uninit') {
  throw new Error('Wallet not deployed yet. Please fund this address with testnet TON first via @testgiver_ton_bot on Telegram.');
}

if (balance === 0) {
  throw new Error('Wallet has zero balance. Please fund this address with testnet TON first via @testgiver_ton_bot on Telegram.');
}

const balanceTon = (balance / 1e9).toFixed(4);
const amountNano_check = Math.round(amountTon * 1e9);
if (balance < amountNano_check + 10000000) { // amount + 0.01 TON for fees
  throw new Error(`Insufficient balance. Have ${balanceTon} TON, trying to send ${amountTon} TON + fees.`);
}
  
  let payload = null;
  if (_customBody) {
    payload = _customBody;
  } else if (comment) {
    const Cell = getCell();
    payload = new Cell();
    payload.bits.writeUint(0, 32);
    const commentBytes = new TextEncoder().encode(comment);
    for (let i = 0; i < commentBytes.length; i++) {
      payload.bits.writeUint(commentBytes[i], 8);
    }
  }

  const amountNano = TonWeb.utils.toNano(amountTon.toString());
  
//   const transfer = wallet.methods.transfer({
//     secretKey: kp.secretKey,
//     toAddress: toAddress,
//     amount: amountNano,
//     seqno: seqno,
//     payload: payload,
//     sendMode: 3,
//   });

//   // const result = await transfer.send();
//   // return result;
//   let result;
// try {
//   result = await transfer.send();
// } catch (err) {
//   // TonWeb calls .json() internally; an empty 200 response throws this error
//   // but the transaction was actually broadcast successfully
//   if (err.message && err.message.includes('Unexpected end of JSON input')) {
//     console.warn('Empty response body after send — treating as success');
//     return { bocHash: 'broadcast_ok' };
//   }
//   throw err;
// }
// return result;
const transfer = wallet.methods.transfer({
  secretKey: kp.secretKey,
  toAddress: toAddress,
  amount: amountNano,
  seqno: seqno,
  payload: payload,
  sendMode: 3,
  stateInit: seqno === 0 ? (await wallet.createStateInit()).stateInit : undefined,
});

// Get the signed BOC bytes without sending
const query = await transfer.getQuery();
const bocBytes = await query.toBoc(false);
const bocBase64 = TonWeb.utils.bytesToBase64(bocBytes);
console.log('BOC:', bocBase64);
console.log('Debug:', {
  seqno,
  fromAddress,
  toAddress,
  amountTon,
  bocBase64: bocBase64.substring(0, 50) + '...',
  walletState: state,
  balance: balanceTon
});
// Send directly to the REST endpoint (not JSON-RPC)
// const response = await fetch('https://testnet.toncenter.com/api/v2/sendBoc', {
//   method: 'POST',
//   headers: HEADERS,
//   body: JSON.stringify({ boc: bocBase64 }),
// });

// const result = await safeJsonResponse(response);
// if (result.ok === false) {
//   throw new Error(result.error || 'sendBoc failed');
// }
// return result;
// Send directly to the REST endpoint with retry for out-of-sync nodes
let result;
for (let attempt = 1; attempt <= 4; attempt++) {
  const response = await fetch('https://testnet.toncenter.com/api/v2/sendBocReturnHash/', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ boc: bocBase64 }),
  });

  result = await safeJsonResponse(response);
  console.log('sendBocReturnHash result:', JSON.stringify(result));
  if (result.ok !== false) break; // success

  const err = result.error || '';
  const isNodeSync = err.includes('LITE_SERVER_NOTREADY') || 
                     err.includes('out of sync') ||
                     err.includes('cannot apply external message');

  if (isNodeSync && attempt < 4) {
    console.warn(`Node out of sync, retrying in ${attempt * 2}s... (attempt ${attempt}/4)`);
    await new Promise(r => setTimeout(r, attempt * 2000)); // 2s, 4s, 6s
    continue;
  }

  throw new Error(err || 'sendBoc failed');
}
const txHash = result.result?.hash || result.result?.hash_norm || null;
const explorerUrl = txHash 
  ? `https://testnet.tonscan.org/tx/${encodeURIComponent(txHash)}` 
  : null;

return { ok: true, txHash, explorerUrl };
}

async function buildJettonTransferBody(toAddress, fromAddress, units) {
  const Cell = getCell();
  const cell = new Cell();
  cell.bits.writeUint(0xf8a7ea5, 32);
  cell.bits.writeUint(0, 64);
  const BN = TonWeb.utils.BN;
  cell.bits.writeCoins(new BN(units.toString()));
  cell.bits.writeAddress(new TonWeb.utils.Address(toAddress));
  cell.bits.writeAddress(new TonWeb.utils.Address(fromAddress));
  cell.bits.writeBit(0);
  cell.bits.writeCoins(new BN(1));
  cell.bits.writeBit(0);
  return cell;
}

// Deposit tracking functions
const _seenTxHashes = {};
const _seenUsdtHashes = {};

async function pollNewTONDeposits(address) {
  try {
    const txs = await fetchTransactions(address, 20);
    const incoming = txs.filter(tx => parseInt(tx.in_msg?.value || '0') > 0);
    
    if (!_seenTxHashes[address]) {
      _seenTxHashes[address] = new Set(incoming.map(tx => tx.transaction_id?.hash || ''));
      return { all: incoming, newOnes: [] };
    }
    
    // This is where the diff happens
const newOnes = incoming.filter(tx => !_seenTxHashes[address].has(tx.transaction_id?.hash || ''));
    newOnes.forEach(tx => _seenTxHashes[address].add(tx.transaction_id?.hash || ''));
    return { all: incoming, newOnes };
  } catch (e) {
    console.error('pollNewTONDeposits error:', e);
    return { all: [], newOnes: [] };
  }
}

async function pollNewUSDTDeposits(address) {
  try {
    const txs = await fetchUSDTTransfers(address, 20);
    const incoming = txs.filter(tx => tx.destination_address === address);
    
    if (!_seenUsdtHashes[address]) {
      _seenUsdtHashes[address] = new Set(incoming.map(tx => tx.transaction_hash || tx.trace_id || ''));
      return { all: incoming, newOnes: [] };
    }
    
    const newOnes = incoming.filter(tx => !_seenUsdtHashes[address].has(tx.transaction_hash || tx.trace_id || ''));
    newOnes.forEach(tx => _seenUsdtHashes[address].add(tx.transaction_hash || tx.trace_id || ''));
    return { all: incoming, newOnes };
  } catch (e) {
    console.error('pollNewUSDTDeposits error:', e);
    return { all: [], newOnes: [] };
  }
}

// Export all functions globally
window.pollNewTONDeposits = pollNewTONDeposits;
window.pollNewUSDTDeposits = pollNewUSDTDeposits;
window.fetchTONBalance = fetchTONBalance;
window.fetchUSDTBalance = fetchUSDTBalance;
window.fetchTransactions = fetchTransactions;
window.fetchUSDTTransfers = fetchUSDTTransfers;
window.sendTONDirect = sendTONDirect;
window.buildJettonTransferBody = buildJettonTransferBody;
window.generateWallet = generateWallet;
window.fetchSeqno = fetchSeqno;
window.shortAddr = shortAddr;
window.isValidTonAddress = isValidTonAddress;
window.getTonWeb = getTonWeb;

// window.parseTxAmount = function(tx) {
//   try { return (parseInt(tx.in_msg?.value || '0') / 1e9).toFixed(4); } catch { return '0'; }
// };
window.parseTxAmount = function(tx) {
  try {
    const incoming = parseInt(tx.in_msg?.value || '0') > 0;
    if (incoming) {
      return (parseInt(tx.in_msg.value) / 1e9).toFixed(4);
    } else {
      // outgoing — sum all out_msgs values
      const outVal = (tx.out_msgs || []).reduce((sum, msg) => sum + parseInt(msg.value || '0'), 0);
      return (outVal / 1e9).toFixed(4);
    }
  } catch { return '0'; }
};

window.parseTxTime = function(tx) {
  try { return new Date(tx.utime * 1000).toLocaleString(); } catch { return '–'; }
};

window.parseTxHash = function(tx) {
  return tx.transaction_id?.hash || tx.hash || '';
};

window.isIncomingTx = function(tx) {
  return parseInt(tx.in_msg?.value || '0') > 0;
};
/**
 * Add these TonConnect functions to your existing ton-connect2.js file
 */

// TonConnect integration functions
let tonConnectUI = null;

// Initialize TonConnect
async function initTonConnect() {
  if (typeof window !== 'undefined' && !tonConnectUI) {
    // Dynamically import TonConnect
    const { TonConnectUI } = await import('@tonconnect/ui');
    
    tonConnectUI = new TonConnectUI({
      manifestUrl: 'https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json',
      buttonRootId: 'ton-connect-button'
    });
    
    return tonConnectUI;
  }
  return tonConnectUI;
}

// Send TON using TonConnect (wallet connection)
async function sendTONWithTonConnect({
  toAddress,
  amountTon,
  comment = '',
  fromAddress // Not needed for TonConnect, but kept for compatibility
}) {
  if (!tonConnectUI) {
    await initTonConnect();
  }
  
  // Check if wallet is connected
  if (!tonConnectUI.connected) {
    throw new Error('Wallet not connected. Please connect your wallet first.');
  }
  
  const amountNano = TonWeb.utils.toNano(amountTon.toString());
  
  // Create the transaction message
  const transaction = {
    validUntil: Math.floor(Date.now() / 1000) + 360, // 6 minutes
    messages: [
      {
        address: toAddress,
        amount: amountNano.toString(),
        payload: comment ? createTextComment(comment) : undefined
      }
    ]
  };
  
  // Send transaction through TonConnect
  const result = await tonConnectUI.sendTransaction(transaction);
  return result;
}

// Send Jetton (USDT) using TonConnect
async function sendUSDTWithTonConnect({
  toAddress,
  amountUSDT,
  jettonMasterAddress = 'EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt'
}) {
  if (!tonConnectUI) {
    await initTonConnect();
  }
  
  if (!tonConnectUI.connected) {
    throw new Error('Wallet not connected. Please connect your wallet first.');
  }
  
  // Get the connected wallet address
  const walletAddress = tonConnectUI.account?.address;
  if (!walletAddress) {
    throw new Error('Could not get wallet address');
  }
  
  // First, get the user's jetton wallet address
  const jettonWallet = await getJettonWalletAddress(walletAddress, jettonMasterAddress);
  
  // Calculate amount in minimal units (6 decimals for USDT)
  const amountUnits = BigInt(Math.floor(amountUSDT * 1_000_000));
  
  // Create jetton transfer body
  const body = await createJettonTransferBody(
    toAddress,
    walletAddress,
    amountUnits
  );
  
  // Create transaction
  const transaction = {
    validUntil: Math.floor(Date.now() / 1000) + 360,
    messages: [
      {
        address: jettonWallet,
        amount: '50000000', // 0.05 TON for gas
        payload: body
      }
    ]
  };
  
  const result = await tonConnectUI.sendTransaction(transaction);
  return result;
}

// Helper: Create text comment payload
function createTextComment(comment) {
  const cell = new TonWeb.boc.Cell();
  cell.bits.writeUint(0, 32); // Simple text comment op code
  const commentBytes = new TextEncoder().encode(comment);
  for (let i = 0; i < commentBytes.length; i++) {
    cell.bits.writeUint(commentBytes[i], 8);
  }
  return cell.toBoc().toString('base64');
}

// Helper: Create jetton transfer body
async function createJettonTransferBody(toAddress, fromAddress, amountUnits) {
  const Cell = getCell();
  const cell = new Cell();
  
  // Jetton transfer op code
  cell.bits.writeUint(0xf8a7ea5, 32);
  // Query ID
  cell.bits.writeUint(0, 64);
  // Amount
  cell.bits.writeCoins(new TonWeb.utils.BN(amountUnits.toString()));
  // Destination address
  cell.bits.writeAddress(new TonWeb.utils.Address(toAddress));
  // Response destination (from address)
  cell.bits.writeAddress(new TonWeb.utils.Address(fromAddress));
  // Custom payload (none)
  cell.bits.writeBit(0);
  // Forward TON amount (1 nanoTON)
  cell.bits.writeCoins(new TonWeb.utils.BN(1));
  // Forward payload (none)
  cell.bits.writeBit(0);
  
  return cell.toBoc().toString('base64');
}

// Helper: Get user's jetton wallet address
async function getJettonWalletAddress(userAddress, jettonMasterAddress) {
  try {
    const response = await fetch(
      `${TON_API_V3}/jetton/wallets?owner_address=${encodeURIComponent(userAddress)}&jetton_address=${encodeURIComponent(jettonMasterAddress)}&limit=1`,
      { headers: HEADERS }
    );
    const data = await response.json();
    
    if (data.jetton_wallets && data.jetton_wallets.length > 0) {
      return data.jetton_wallets[0].address;
    }
    throw new Error('Jetton wallet not found. You need to receive USDT first to initialize the wallet.');
  } catch (error) {
    console.error('Error getting jetton wallet:', error);
    throw error;
  }
}

// Check if wallet is connected
async function isWalletConnected() {
  if (!tonConnectUI) {
    await initTonConnect();
  }
  return tonConnectUI?.connected || false;
}

// Get connected wallet address
async function getConnectedWalletAddress() {
  if (!tonConnectUI) {
    await initTonConnect();
  }
  return tonConnectUI?.account?.address || null;
}

// Disconnect wallet
async function disconnectWallet() {
  if (tonConnectUI) {
    await tonConnectUI.disconnect();
  }
}

// Export TonConnect functions
window.initTonConnect = initTonConnect;
window.sendTONWithTonConnect = sendTONWithTonConnect;
window.sendUSDTWithTonConnect = sendUSDTWithTonConnect;
window.isWalletConnected = isWalletConnected;
window.getConnectedWalletAddress = getConnectedWalletAddress;
window.disconnectWallet = disconnectWallet;