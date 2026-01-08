import "./style.css";
import { ethers } from "ethers";
import { createWeb3Modal, defaultConfig } from "@web3modal/ethers";



const API = "https://basepixels-backend.onrender.com";

/**
 * CONFIG — fill these in
 */
const CONFIG = {
  tokenName: "$BasePixels", // label only
  tokenAddress: "0x0000000000000000000000000000000000000000", // TODO: your ERC20 on Base
  tokenDecimals: 18,
  minHoldToPlace: 100_000, // 100k tokens
  cooldownSeconds: 60, // 1 minute
  baseChainIdHex: "0x2105", // Base mainnet (8453)
  zoraProfileUrl: "https://zora.co/@tomas_soet", // change if needed
  zoraCoinUrl: "https://zora.co/@tomas_soet",    // you can point to coin page later
};

const projectId = "dcb691a014fec255eb6ca530881b0f41";

const base = {
  chainId: 8453,
  name: "Base",
  currency: "ETH",
  explorerUrl: "https://basescan.org",
  rpcUrl: "https://mainnet.base.org"
};

const metadata = {
  name: "BasePixels",
  description: "Token-gated pixel canvas on Base. Place 1 pixel per minute.",
  url: "https://basepixels.fun.com", // tu peux mettre ton domaine plus tard
  icons: ["https://basepixels.fun/basepixels.png"] // idem
};

const ethersConfig = defaultConfig({
  metadata,
  defaultChainId: 8453,
  rpcUrl: base.rpcUrl
});

const modal = createWeb3Modal({
  ethersConfig,
  chains: [base],
  projectId
});


// Minimal ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const app = document.querySelector("#app");

// Canvas settings
const SIZE = 128;

const SCALE = 10;          // visual scaling (handled by CSS sizing too)
const STORAGE_KEY = "pixel_canvas_v1";

let cooldownInterval = null;


// State
let provider = null;
let signer = null;
let userAddress = null;

let tokenBalance = 0;      // human-readable
let eligible = false;

let cooldownRemaining = 0;

async function refreshCooldown() {
  if (!userAddress) { cooldownRemaining = 0; return; }
  const r = await fetch(`${API}/cooldown?address=${encodeURIComponent(userAddress)}`);
  const j = await r.json();
  cooldownRemaining = Number(j.remaining || 0);
}


let selectedColor = "#ff00cc";
let hover = { x: -1, y: -1 };

// Pixel data stored as array of hex colors or null
let pixels = new Array(SIZE * SIZE).fill(null);


async function loadGlobalPixels(){
  const r = await fetch(`${API}/pixels`);
  pixels = await r.json();
  draw();
}



function loadPixels() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return new Array(SIZE * SIZE).fill(null);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === SIZE * SIZE) return parsed;
  } catch {}
  return new Array(SIZE * SIZE).fill(null);
}

function savePixels() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels));
}



function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function idx(x, y) {
  return y * SIZE + x;
}

function render() {
  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div class="brand">
          <h1>Base Pixels</h1>
          <p>
            The first token-gated canvas on <b>Base</b>. Hold <b>${CONFIG.minHoldToPlace.toLocaleString()}</b> tokens to place
            <b>1 pixel / minute</b>. We take a pic of the canvas at least twice a day and post it on Zora and our Socials.
          </p>

          </div>

        <div class="actions">
          <a class="btn" href="${CONFIG.zoraProfileUrl}" target="_blank" rel="noreferrer">Zora Profile</a>
          <a class="btn" href="${CONFIG.zoraCoinUrl}" target="_blank" rel="noreferrer">Zora Coin</a>
          <a class="btn" href="https://x.com/PixelsFromBase" target="_blank" rel="noreferrer">X (Twitter)</a>

          ${
            userAddress
              ? `<button class="btn" id="disconnectBtn">Disconnect</button>`
              : `<button class="btn primary" id="connectBtn">Connect wallet</button>`
          }
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <h2>Canvas</h2>
          <div class="canvasWrap">
            <canvas id="canvas" width="${SIZE}" height="${SIZE}"></canvas>

            <div class="tools">
              <div class="tool">
                <label>Color</label>
                <input id="colorPicker" type="color" value="${selectedColor}" />
                <small>Pick a color, then click a pixel to place it.</small>
              </div>

              <div class="tool">
                <div class="row">
                  <div class="kv">
                    <div class="k">Wallet</div>
                    <div class="v mono">${userAddress ? shortAddr(userAddress) : "Not connected"}</div>
                  </div>
                  <div class="badge ${eligible ? "ok" : "no"}">
                    ${eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}
                  </div>
                </div>

                <div class="hr"></div>

                <div class="row">
                  <div class="kv">
                    <div class="k">Balance</div>
                    <div class="v">${userAddress ? `${tokenBalance.toLocaleString()} ${CONFIG.tokenName}` : "—"}</div>
                  </div>

                  <div class="kv">
                    <div class="k">Cooldown</div>
                    <div class="v" id="cooldownText">${userAddress ? `${cooldownRemaining}s` : "—"}</div>


                  </div>
                </div>

                <div class="notice">
                  Rule: hold <b>${CONFIG.minHoldToPlace.toLocaleString()}+</b> to place a pixel.
                Cooldown is enforced server-side per wallet.

                </div>
              </div>

              
            </div>
          </div>
        </div>

        <div class="card">
          <h2>How it works</h2>
          <div class="kv">
            <div class="k">1) Hold</div>
            <div class="v">Get to ${CONFIG.minHoldToPlace.toLocaleString()}+ ${CONFIG.tokenName} on Base.</div>
          </div>
          <div class="hr"></div>
          <div class="kv">
            <div class="k">2) Place</div>
            <div class="v">Click the canvas to place 1 pixel every minute.</div>
          </div>
          <div class="hr"></div>
          <div class="kv">
            <div class="k">3) Coordinate</div>
            <div class="v">Communities form around images, logos, and raids.</div>
          </div>

          <div class="hr"></div>

          
          <div class="footer">
            <span>Build: neat v1</span>
            <span class="mono">SIZE=${SIZE} • cooldown=${CONFIG.cooldownSeconds}s</span>
          </div>
        </div>
      </div>
    </div>
  `;

  wireUI();
  draw();
}

function wireUI() {
  const canvas = document.getElementById("canvas");

  // Connect/disconnect
  const connectBtn = document.getElementById("connectBtn");
  if (connectBtn) connectBtn.addEventListener("click", connect);

  const disconnectBtn = document.getElementById("disconnectBtn");
  if (disconnectBtn) disconnectBtn.addEventListener("click", () => {
  provider = null; signer = null; userAddress = null;
  tokenBalance = 0; eligible = false;
  cooldownRemaining = 0;

  if (cooldownInterval) {
    clearInterval(cooldownInterval);
    cooldownInterval = null;
  }

  render();
});


  // Color picker
  const colorPicker = document.getElementById("colorPicker");
  colorPicker.addEventListener("input", (e) => {
    selectedColor = e.target.value;
  });

  // Hover + click placement
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * SIZE);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * SIZE);
    hover.x = clamp(x, 0, SIZE - 1);
    hover.y = clamp(y, 0, SIZE - 1);
    draw();
  });

  canvas.addEventListener("mouseleave", () => {
    hover.x = -1; hover.y = -1;
    draw();
  });

  canvas.addEventListener("click", async () => {
    if (!userAddress) return toast("Connect wallet first.");
    if (!eligible) return toast(`Need ${CONFIG.minHoldToPlace.toLocaleString()}+ ${CONFIG.tokenName} to place.`);
    
    await refreshCooldown();
if (cooldownRemaining > 0) return toast(`Cooldown: wait ${cooldownRemaining}s.`);


    if (hover.x < 0 || hover.y < 0) return;

    const i = idx(hover.x, hover.y);
pixels[i] = selectedColor;

const resp = await fetch(`${API}/pixels`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ 
    index: i, 
    color: selectedColor,
    address: userAddress 
  })
});

if (!resp.ok) {
  const err = await resp.json().catch(() => ({}));
  if (resp.status === 429 && err.remaining != null) {
    cooldownRemaining = err.remaining;
    draw();
    return toast(`Cooldown: wait ${cooldownRemaining}s.`);
  }
  return toast("Server error placing pixel.");
}

cooldownRemaining = CONFIG.cooldownSeconds;
draw();
toast(`Pixel placed at (${hover.x}, ${hover.y}).`);

await loadGlobalPixels();


  });

  
  

 if (cooldownInterval) clearInterval(cooldownInterval);

cooldownInterval = setInterval(async () => {
  await refreshCooldown();
  const el = document.getElementById("cooldownText");
if (el) el.textContent = userAddress ? `${cooldownRemaining}s` : "—";

}, 1000);


}

function draw() {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  // clear
  ctx.clearRect(0, 0, SIZE, SIZE);

  // background grid faint
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  for (let i = 0; i < SIZE * SIZE; i++) {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    if ((x + y) % 2 === 0) ctx.fillRect(x, y, 1, 1);
  }

  // pixels
  for (let i = 0; i < pixels.length; i++) {
    const c = pixels[i];
    if (!c) continue;
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  }

  // hover outline
  if (hover.x >= 0 && hover.y >= 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(hover.x + 0.05, hover.y + 0.05, 0.9, 0.9);
  }
}

async function connect() {
  // ouvre le modal propre (MetaMask, WalletConnect, etc.)
  await modal.open();

  // provider EIP-1193 donné par Web3Modal
  const walletProvider = modal.getWalletProvider();
  if (!walletProvider) return;

  provider = new ethers.BrowserProvider(walletProvider);
  signer = await provider.getSigner();
  userAddress = await signer.getAddress();

  await refreshBalance();
  await refreshCooldown();
  render();

  // si l’utilisateur change de compte ou de chain, on refresh
  walletProvider.on?.("accountsChanged", async () => {
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();
    await refreshBalance();
    await refreshCooldown();
    render();
  });

  walletProvider.on?.("chainChanged", async () => {
    await refreshBalance();
    await refreshCooldown();
    render();
  });
}


async function refreshBalance() {
  tokenBalance = 0;
  eligible = false;

  // If token address not set, allow UI but show not eligible
  if (!CONFIG.tokenAddress || CONFIG.tokenAddress === "0x0000000000000000000000000000000000000000") {
    toast("Token address not set yet. Update CONFIG.tokenAddress.");
    return;
  }

  const token = new ethers.Contract(CONFIG.tokenAddress, ERC20_ABI, provider);

  let decimals = CONFIG.tokenDecimals;
  try {
    decimals = await token.decimals();
  } catch {}

  const raw = await token.balanceOf(userAddress);
  const human = Number(ethers.formatUnits(raw, decimals));

  tokenBalance = isFinite(human) ? human : 0;
  eligible = tokenBalance >= CONFIG.minHoldToPlace;
}

function toast(msg) {
  console.log(msg);
  // minimal toast
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.position = "fixed";
  t.style.left = "50%";
  t.style.bottom = "18px";
  t.style.transform = "translateX(-50%)";
  t.style.padding = "10px 12px";
  t.style.borderRadius = "12px";
  t.style.background = "rgba(0,0,0,.75)";
  t.style.border = "1px solid rgba(255,255,255,.14)";
  t.style.color = "white";
  t.style.fontWeight = "700";
  t.style.fontSize = "13px";
  t.style.zIndex = "9999";
  t.style.backdropFilter = "blur(10px)";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

render();
loadGlobalPixels();
setInterval(loadGlobalPixels, 2000);


