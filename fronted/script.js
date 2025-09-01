const API_URL = "https://api.cuttests.xyz/api/submit"; // или http://localhost:3000/api/submit

const form = document.getElementById("whitelistForm");
const status = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const twitter = document.getElementById("twitter").value.trim();
  const reply_link = document.getElementById("reply_link").value.trim();
  const wallet = document.getElementById("wallet").value.trim();

  // быстрые клиентские проверки как у тебя
  if (!/^@?[a-zA-Z0-9_]{1,15}$/.test(twitter)) {
    status.textContent = "❌ Error: incorrect Twitter username.";
    status.style.color = "red";
    return;
  }
  if (!/^https:\/\/(twitter|x)\.com\/.+/i.test(reply_link)) {
    status.textContent = "❌ Error: incorrect reply link.";
    status.style.color = "red";
    return;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    status.textContent = "❌ Error: incorrect wallet.";
    status.style.color = "red";
    return;
  }

  status.textContent = "⏳ Checking...";
  status.style.color = "white";

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twitter, reply_link, wallet })
    });
    const json = await res.json();
    if (res.ok && json.success) {
      status.textContent = "✅ In review. TY ❤️";
      status.style.color = "black";
      form.reset();
    } else {
      status.textContent = "❌ " + (json.error || "Unknown error");
      status.style.color = "red";
    }
  } catch {
    status.textContent = "❌ Network error.";
    status.style.color = "red";
  }
});
const checkWLBtn = document.getElementById("checkWLBtn");
const modal = document.getElementById("wlModal");
const closeModal = document.querySelector(".modal .close");
const checkBtn = document.getElementById("checkBtn");
const checkWalletInput = document.getElementById("checkWallet");
const checkStatus = document.getElementById("checkStatus");

checkWLBtn.onclick = () => modal.style.display = "block";
closeModal.onclick = () => modal.style.display = "none";
window.onclick = e => { if(e.target==modal) modal.style.display="none"; }

checkBtn.onclick = async () => {
  const wallet = checkWalletInput.value.trim();
  if(!/^0x[a-fA-F0-9]{40}$/.test(wallet)){
    checkStatus.textContent = "❌ Invalid wallet";
    checkStatus.style.color = "red";
    return;
  }
  checkStatus.textContent = "⏳ Checking...";
  checkStatus.style.color = "black";

  try {
    const res = await fetch(`/api/check-wl?wallet=${wallet}`);
    const json = await res.json();
    if(json.found){
      checkStatus.textContent = "✅ You are on the list";
      checkStatus.style.color = "green";
    } else {
      checkStatus.textContent = "❌ You are not on the list";
      checkStatus.style.color = "red";
    }
  } catch {
    checkStatus.textContent = "❌ Network error";
    checkStatus.style.color = "red";
  }
}

