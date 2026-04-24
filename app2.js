/**
 * app.js – TON Testnet Lab (COMPLETELY FIXED)
 */

const STORAGE_KEY = 'ton_lab_users_v2';
const DEPOSITS_KEY = 'ton_lab_deposits_v2';

let users = [];
let depositData = {};
let refreshTimer = null;

function saveUsers() { localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); }
function saveDeposits() { localStorage.setItem(DEPOSITS_KEY, JSON.stringify(depositData)); }

function loadUsers() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) users = JSON.parse(s);
  } catch { users = []; }
}

function loadDeposits() {
  try {
    const s = localStorage.getItem(DEPOSITS_KEY);
    if (s) depositData = JSON.parse(s);
  } catch { depositData = {}; }
}

document.addEventListener('DOMContentLoaded', async () => {
  await waitForLibraries();
  loadUsers();
  loadDeposits();
  renderAll();
  await refreshAll(true);
  refreshTimer = setInterval(() => refreshAll(true), 30000);
});

function waitForLibraries() {
  return new Promise(resolve => {
    const check = () => {
      if (typeof nacl !== 'undefined' && typeof TonWeb !== 'undefined') {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

function renderAll() {
  renderUserList();
  renderSendSelects();
  renderDeposits();
}

function renderUserList() {
  const grid = document.getElementById('user-list');
  if (!grid) return;

  if (users.length === 0) {
    grid.innerHTML = `<div class="empty-state">No users yet. Click <strong>+ Add User</strong> to generate a wallet.</div>`;
    return;
  }

  grid.innerHTML = users.map((u, i) => `
    <div class="user-card" id="card-${u.id}">
      <button class="delete-btn" onclick="removeUser('${u.id}', event)" title="Remove">✕</button>
      <div class="user-idx">USER_${String(i + 1).padStart(2, '0')}</div>
      <div class="user-name">${escHtml(u.name)}</div>
      <div class="user-state ${u.walletState === 'active' ? 'state-active' : 'state-uninit'}">
  ${u.walletState === 'active' ? '● Active' : '● Not Deployed'}
</div>
      <div class="user-addr" title="${escHtml(u.address)}">${window.shortAddr(u.address)}</div>
      <div class="user-balance">
        <div class="bal-row">
          <span class="bal-label">TON</span>
          <span class="bal-ton" id="bal-ton-${u.id}">${u.tonBalance ?? '…'}</span>
        </div>
        <div class="bal-row">
          <span class="bal-label">USDT</span>
          <span class="bal-usdt" id="bal-usdt-${u.id}">${u.usdtBalance ?? '…'}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="view-tx-btn" onclick="showTxModal('${u.id}')">View Txs</button>
        <button class="view-tx-btn key-btn" onclick="showKeyModal('${u.id}')">Keys</button>
        <button class="view-tx-btn" onclick="copyAddress('${u.address}')" title="Copy Address">Copy Address</button>
      </div>
    </div>
  `).join('');
}

function renderSendSelects() {
  ['send-from', 'send-to', 'usdt-from', 'usdt-to'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = users.length === 0
      ? '<option value="">— add users first —</option>'
      : users.map(u => `<option value="${u.id}">${escHtml(u.name)} (${window.shortAddr(u.address)})</option>`).join('');
    if (prev && users.find(u => u.id === prev)) sel.value = prev;
  });
}

function renderDeposits() {
  const container = document.getElementById('deposits-container');
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = '<div class="empty-state">Add users to monitor deposits.</div>';
    return;
  }

  container.innerHTML = users.map(u => {
    const d = depositData[u.address] || { ton: [], usdt: [] };
    const tonTxs = (d.ton || []).slice(0, 5);
    const uTxs = (d.usdt || []).slice(0, 5);

    const items = [
  ...tonTxs.map(tx => ({
    type: 'ton',
    amount: window.parseTxAmount(tx) + ' TON',
    time: window.parseTxTime(tx),
    ts: tx.utime || 0,
    isNew: depositData[u.address]?.newTon?.includes(tx.transaction_id?.hash),
  })),
  ...uTxs.map(tx => ({
    type: 'usdt',
    amount: (parseInt(tx.amount || '0') / 1e6).toFixed(2) + ' USDT',
    time: tx.transaction_now ? new Date(tx.transaction_now * 1000).toLocaleString() : '–',
    ts: tx.transaction_now || 0,
    isNew: depositData[u.address]?.newUsdt?.includes(tx.transaction_hash),
  })),
]

    return `
      <div class="deposit-card">
        <div class="dep-user">${escHtml(u.name)}</div>
        ${items.length === 0
        ? '<div class="dep-empty">No deposits yet — send TON to this address</div>'
        : items.map(tx => `
          <div class="dep-tx" data-new="${tx.isNew ? 'true' : 'false'}">
           
              <span class="dep-type ${tx.type}">${tx.type.toUpperCase()}</span>
              <span class="dep-amount">${tx.amount}</span>
              <span class="dep-time">${tx.time}</span>
            </div>`).join('')}
      </div>`;
  }).join('');
  // Trigger animation after DOM is painted
requestAnimationFrame(() => {
  document.querySelectorAll('.dep-tx[data-new="true"]').forEach(el => {
    el.classList.add('dep-new');
  });
});
}

function openAddUser() {
  if (users.length >= 5) { alert('Maximum 5 users allowed.'); return; }
  document.getElementById('modal-name').value = '';
  document.getElementById('modal-address').value = '';
  document.getElementById('modal-privkey').value = '';
  document.getElementById('modal-pubkey').value = '';
  document.getElementById('modal-error').textContent = '';
  document.getElementById('modal-gen-status').textContent = '';
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeAddUser() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function closeModal(e) {
  if (e.target.id === 'modal-overlay') closeAddUser();
}

async function generateNewWallet() {
  const statusEl = document.getElementById('modal-gen-status');
  statusEl.textContent = 'Generating keypair…';
  try {
    const wallet = await window.generateWallet();
    document.getElementById('modal-address').value = wallet.address;
    document.getElementById('modal-privkey').value = wallet.privateKey;
    document.getElementById('modal-pubkey').value = wallet.publicKey;
    statusEl.textContent = '✓ Keypair generated successfully!';
  } catch (err) {
    statusEl.textContent = '✗ ' + err.message;
    console.error(err);
  }
}

async function addUser() {
  const name = document.getElementById('modal-name').value.trim();
  const address = document.getElementById('modal-address').value.trim();
  const privKey = document.getElementById('modal-privkey').value.trim();
  const pubKey = document.getElementById('modal-pubkey').value.trim();
  const errEl = document.getElementById('modal-error');

  if (!name) { errEl.textContent = 'Please enter a name.'; return; }
  if (!address) { errEl.textContent = 'Please generate or enter an address.'; return; }
  if (!window.isValidTonAddress(address)) { errEl.textContent = 'Invalid TON address.'; return; }
  if (users.find(u => u.address === address)) { errEl.textContent = 'Address already added.'; return; }

  const user = {
    id: 'u_' + Date.now(),
    name,
    address,
    privateKey: privKey || null,
    publicKey: pubKey || null,
    tonBalance: null,
    usdtBalance: null,
  };

  users.push(user);
  saveUsers();
  closeAddUser();
  renderAll();
  await fetchAndUpdateUser(user);
  renderUserList();
}

function removeUser(id, e) {
  e.stopPropagation();
  if (!confirm('Remove this user?')) return;
  users = users.filter(u => u.id !== id);
  saveUsers();
  renderAll();
}

// Replace your existing sendTON function with this version
async function sendTON() {
  const fromId = document.getElementById('send-from').value;
  const toId = document.getElementById('send-to').value;
  const amount = parseFloat(document.getElementById('send-amount').value);
  const comment = document.getElementById('send-comment').value.trim();
  const statusEl = document.getElementById('send-ton-status');

  if (!fromId || !toId) {
    setStatus(statusEl, 'error', 'Select sender and recipient.');
    return;
  }
  if (fromId === toId) {
    setStatus(statusEl, 'error', 'Sender and recipient must differ.');
    return;
  }
  if (!amount || amount <= 0) {
    setStatus(statusEl, 'error', 'Enter a valid amount > 0.');
    return;
  }

  const fromUser = users.find(u => u.id === fromId);
  const toUser = users.find(u => u.id === toId);

  // Check if using TonConnect for external wallets
  const useTonConnect = fromUser.isExternal || false;

  setStatus(statusEl, 'pending', `Preparing to send ${amount} TON from ${fromUser.name} to ${toUser.name}...`);

  try {
    let result;

    if (useTonConnect) {
      // Use TonConnect for external wallet
      await window.initTonConnect();
      result = await window.sendTONWithTonConnect({
        toAddress: toUser.address,
        amountTon: amount,
        comment: comment
      });
    } else {
      // Use direct signing for generated wallets
      if (!fromUser.privateKey) {
        throw new Error('Sender has no private key. Use TonConnect for external wallets.');
      }

      result = await window.sendTONDirect({
        fromAddress: fromUser.address,
        privateKeyHex: fromUser.privateKey,
        toAddress: toUser.address,
        amountTon: amount,
        comment: comment,
      });
    }
    console.log('result in sendTON:', result);
    setStatus(statusEl, 'success',
      `✓ Sent ${amount} TON from ${fromUser.name} to ${toUser.name}
   ${result?.txHash
        ? `<br><a href="${result.explorerUrl}" target="_blank" style="color:var(--accent)">
        🔍 View on Tonscan: ${result.txHash.substring(0, 16)}...</a>`
        : ''
      }`
    );

    setTimeout(() => refreshAll(true), 8000);
    setTimeout(() => refreshAll(true), 20000);
  } catch (err) {
    console.error('Send error details:', err);

    if (err.message.includes('wallet not connected')) {
      setStatus(statusEl, 'error',
        `✗ Please connect your wallet first. Click the TonConnect button to connect.`);
    } else {
      setStatus(statusEl, 'error', `✗ Failed: ${err.message || err.toString()}`);
    }
  }
}

// Add a function to mark a user as external (using TonConnect)
function markUserAsExternal(userId) {
  const user = users.find(u => u.id === userId);
  if (user) {
    user.isExternal = true;
    user.privateKey = null; // External wallets don't store private keys
    saveUsers();
    renderUserList();
  }
}

// Add a function to connect external wallet
async function connectExternalWallet() {
  try {
    await window.initTonConnect();

    if (!window.isWalletConnected()) {
      // This will open the wallet connection modal
      await window.tonConnectUI?.connectWallet();
    }

    const address = await window.getConnectedWalletAddress();
    if (address) {
      // Check if this address is already in users
      const existingUser = users.find(u => u.address === address);
      if (!existingUser) {
        // Prompt to add as new user
        const name = prompt('Wallet connected! Enter a name for this wallet:', 'External Wallet');
        if (name) {
          const newUser = {
            id: 'u_' + Date.now(),
            name: name,
            address: address,
            privateKey: null,
            publicKey: null,
            isExternal: true,
            tonBalance: null,
            usdtBalance: null,
          };
          users.push(newUser);
          saveUsers();
          renderAll();
          await fetchAndUpdateUser(newUser);
          setStatus(document.getElementById('send-ton-status'), 'success',
            `✓ External wallet connected! You can now send TON from this wallet.`);
        }
      } else {
        setStatus(document.getElementById('send-ton-status'), 'info',
          `✓ Wallet ${existingUser.name} is already connected.`);
      }
    }
  } catch (err) {
    console.error('Failed to connect wallet:', err);
    setStatus(document.getElementById('send-ton-status'), 'error',
      `✗ Failed to connect wallet: ${err.message}`);
  }
}
async function sendUSDT() {
  const fromId = document.getElementById('usdt-from').value;
  const toId = document.getElementById('usdt-to').value;
  const amount = parseFloat(document.getElementById('usdt-amount').value);
  const statusEl = document.getElementById('send-usdt-status');

  if (!fromId || !toId) {
    setStatus(statusEl, 'error', 'Select sender and recipient.');
    return;
  }
  if (fromId === toId) {
    setStatus(statusEl, 'error', 'Sender and recipient must differ.');
    return;
  }
  if (!amount || amount <= 0) {
    setStatus(statusEl, 'error', 'Enter a valid amount.');
    return;
  }

  const fromUser = users.find(u => u.id === fromId);
  const toUser = users.find(u => u.id === toId);

  if (!fromUser.privateKey) {
    setStatus(statusEl, 'error', 'Sender has no private key.');
    return;
  }

  setStatus(statusEl, 'pending', `Building USDT transfer...`);

  try {
    const jwResp = await fetch(`${TON_API_V3}/jetton/wallets?owner_address=${encodeURIComponent(fromUser.address)}&jetton_address=${encodeURIComponent(USDT_MASTER)}&limit=1`, {
      headers: HEADERS
    });
    const jwData = await jwResp.json();

    if (!jwData.jetton_wallets || jwData.jetton_wallets.length === 0) {
      throw new Error('No USDT jetton wallet found. Need testnet USDT first.');
    }

    const jettonWalletAddr = jwData.jetton_wallets[0].address;
    const units = BigInt(Math.round(amount * 1e6));
    const jBody = await window.buildJettonTransferBody(toUser.address, fromUser.address, units);

    await window.sendTONDirect({
      fromAddress: fromUser.address,
      privateKeyHex: fromUser.privateKey,
      toAddress: jettonWalletAddr,
      amountTon: 0.05,
      comment: '',
      _customBody: jBody,
    });

    setStatus(statusEl, 'success', `✓ USDT transfer sent! ${amount} USDT from ${fromUser.name} to ${toUser.name}`);
    setTimeout(() => refreshAll(true), 8000);
  } catch (err) {
    console.error('USDT send error:', err);
    setStatus(statusEl, 'error', `✗ Failed: ${err.message}`);
  }
}

async function refreshAll(silent = false) {
  const btn = document.querySelector('.btn-refresh');
  if (btn && !silent) btn.textContent = '↻ …';

  for (const user of users) {
    await fetchAndUpdateUser(user);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  renderUserList();
  renderDeposits();

  if (btn && !silent) btn.textContent = '↻ Refresh';
}

async function fetchAndUpdateUser(user) {
  try {
    const [ton, usdt] = await Promise.allSettled([
      window.fetchTONBalance(user.address),
      window.fetchUSDTBalance(user.address),
    ]);

    if (ton.status === 'fulfilled' && ton.value !== null) user.tonBalance = ton.value;
    if (usdt.status === 'fulfilled' && usdt.value !== null) user.usdtBalance = usdt.value;

    const [tonDeps, usdtDeps] = await Promise.allSettled([
      window.pollNewTONDeposits(user.address),
      window.pollNewUSDTDeposits(user.address),
    ]);

    if (!depositData[user.address]) depositData[user.address] = { ton: [], usdt: [] };

    if (tonDeps.status === 'fulfilled') {
      depositData[user.address].ton = tonDeps.value.all;
    }
    if (usdtDeps.status === 'fulfilled') {
      depositData[user.address].usdt = usdtDeps.value.all;
    }
    const infoResp = await fetch(`${TON_API_BASE}/getAddressInformation?address=${encodeURIComponent(user.address)}`, {
      headers: HEADERS
    });
    const info = await safeJsonResponse(infoResp);
    user.walletState = info.result?.state || 'uninit';
    if (tonDeps.status === 'fulfilled') {
  depositData[user.address].ton = tonDeps.value.all;
  depositData[user.address].newTon = tonDeps.value.newOnes.map(tx => tx.transaction_id?.hash);
}
if (usdtDeps.status === 'fulfilled') {
  depositData[user.address].usdt = usdtDeps.value.all;
  depositData[user.address].newUsdt = usdtDeps.value.newOnes.map(tx => tx.transaction_hash);
}

    saveUsers();
    saveDeposits();

    const tonEl = document.getElementById(`bal-ton-${user.id}`);
    const usdtEl = document.getElementById(`bal-usdt-${user.id}`);
    if (tonEl) tonEl.textContent = user.tonBalance ?? '?';
    if (usdtEl) usdtEl.textContent = user.usdtBalance ?? '?';
  } catch (err) {
    console.error(`Error updating user ${user.name}:`, err);
  }
}

async function showTxModal(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('tx-modal-title').textContent = `Transactions – ${user.name}`;
  document.getElementById('tx-modal-body').innerHTML = `<div style="padding:12px">Loading...</div>`;
  document.getElementById('tx-modal-overlay').classList.remove('hidden');

  const [txs, usdtTxs] = await Promise.all([
    window.fetchTransactions(user.address, 20),
    window.fetchUSDTTransfers(user.address, 20),
  ]);

  // const tonItems = txs.map(tx => {
  //   const incoming = window.isIncomingTx(tx);
  //   const amount = window.parseTxAmount(tx);
  //   const time = window.parseTxTime(tx);
  //   const hash = window.parseTxHash(tx);
  //   const comment = tx.in_msg?.message || '';
  //   return `<div class="tx-item">
  //     <span class="tx-dir">${incoming ? '↓' : '↑'}</span>
  //     <div class="tx-info">
  //       <div class="tx-hash">${hash ? window.shortAddr(hash) : 'Transfer'}</div>
  //       ${comment ? `<div class="tx-comment">${escHtml(comment)}</div>` : ''}
  //     </div>
  //     <div class="tx-val ${incoming ? 'incoming' : 'outgoing'}">${incoming ? '+' : '-'}${amount} TON</div>
  //     <div class="tx-time">${time}</div>
  //   </div>`;
  // });
  const tonItems = txs.map(tx => {
  const incoming = window.isIncomingTx(tx);
  const amount = window.parseTxAmount(tx);
  const time = window.parseTxTime(tx);
  const hash = window.parseTxHash(tx);
  const comment = tx.in_msg?.message || '';
  const explorerUrl = hash 
    ? `https://testnet.tonscan.org/tx/${encodeURIComponent(hash)}` 
    : null;

  return `<div class="tx-item ${explorerUrl ? 'tx-clickable' : ''}" 
    ${explorerUrl ? `onclick="window.open('${explorerUrl}', '_blank')"` : ''}>
    <span class="tx-dir">${incoming ? '↓' : '↑'}</span>
    <div class="tx-info">
      <div class="tx-hash">${hash ? window.shortAddr(hash) : 'Transfer'}</div>
      ${comment ? `<div class="tx-comment">${escHtml(comment)}</div>` : ''}
    </div>
    <div class="tx-val ${incoming ? 'incoming' : 'outgoing'}">${incoming ? '+' : '-'}${amount} TON</div>
    <div class="tx-time">${time}</div>
    ${explorerUrl ? '<div class="tx-link">🔍</div>' : ''}
  </div>`;
});

  const usdtItems = usdtTxs.map(tx => {
    const amount = (parseInt(tx.amount || '0') / 1e6).toFixed(2);
    const time = tx.transaction_now ? new Date(tx.transaction_now * 1000).toLocaleString() : '–';
    const dir = tx.destination_address === user.address ? 'incoming' : 'outgoing';
    const arrow = dir === 'incoming' ? '↓' : '↑';
    const sign = dir === 'incoming' ? '+' : '-';
    return `<div class="tx-item">
      <span class="tx-dir" style="color:var(--usdt)">${arrow}</span>
      <div class="tx-info">
        <div class="tx-hash">USDT Jetton</div>
      </div>
      <div class="tx-val ${dir}">${sign}${amount} USDT</div>
      <div class="tx-time">${time}</div>
    </div>`;
  });

  const all = [...tonItems, ...usdtItems];
  document.getElementById('tx-modal-body').innerHTML = all.length === 0
    ? '<div style="padding:12px">No transactions found.</div>'
    : all.join('');
}

function closeTxModal(e) {
  if (!e || e.target.id === 'tx-modal-overlay')
    document.getElementById('tx-modal-overlay').classList.add('hidden');
}

function showKeyModal(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('key-modal-title').textContent = `Keys – ${user.name}`;
  document.getElementById('key-modal-body').innerHTML = `
    <div class="key-row"><span class="key-label">Address</span><code class="key-val copyable" onclick="copyText(this)">${escHtml(user.address)}</code></div>
    <div class="key-row"><span class="key-label">Public Key</span><code class="key-val copyable" onclick="copyText(this)">${escHtml(user.publicKey || '(not stored)')}</code></div>
    <div class="key-row warning-row">
      <span class="key-label">Private Key ⚠️</span>
      <code class="key-val copyable" onclick="copyText(this)">${escHtml(user.privateKey || '(not available)')}</code>
    </div>
    <p class="key-warn">⚠ Never share your private key. Testnet only.</p>
  `;
  document.getElementById('key-modal-overlay').classList.remove('hidden');
}

function closeKeyModal(e) {
  if (!e || e.target.id === 'key-modal-overlay')
    document.getElementById('key-modal-overlay').classList.add('hidden');
}

function copyText(el) {
  navigator.clipboard.writeText(el.textContent).then(() => {
    const orig = el.style.opacity;
    el.style.opacity = '0.5';
    setTimeout(() => el.style.opacity = orig, 300);
  });
}

function setStatus(el, type, msg) {
  el.className = 'status-msg ' + type;
  el.innerHTML = msg;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function copyAddress(address) {
  navigator.clipboard.writeText(address).then(() => {
    // Brief visual feedback
    const btns = document.querySelectorAll('.view-tx-btn');
    btns.forEach(btn => {
      if (btn.onclick?.toString().includes(address)) {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = orig, 1500);
      }
    });
  });
}


window.copyAddress = copyAddress;

// Make functions globally available
window.sendTON = sendTON;
window.sendUSDT = sendUSDT;
window.openAddUser = openAddUser;
window.closeAddUser = closeAddUser;
window.closeModal = closeModal;
window.generateNewWallet = generateNewWallet;
window.addUser = addUser;
window.removeUser = removeUser;
window.refreshAll = refreshAll;
window.showTxModal = showTxModal;
window.closeTxModal = closeTxModal;
window.showKeyModal = showKeyModal;
window.closeKeyModal = closeKeyModal;
window.copyText = copyText;