(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  const prefModal = document.getElementById("prefModal");
  const yesPref = document.getElementById("yesPref");
  const noPref = document.getElementById("noPref");
  const newModal = document.getElementById("newModal");
  const confirmNew = document.getElementById("confirmNew");
  const cancelNew = document.getElementById("cancelNew");
  const newTimerText = document.getElementById("newTimerText");

  let clientToken = localStorage.getItem("bingo_token");
  if (!clientToken) {
    clientToken = crypto.randomUUID();
    localStorage.setItem("bingo_token", clientToken);
  }

  const api = async (path, opts = {}) => {
    const headers = Object.assign({}, opts.headers || {}, {
      "Content-Type": "application/json",
      "x-bingo-token": clientToken,
    });
    const res = await fetch(path, { ...opts, headers });
    return res.json();
  };

  const renderBoard = (board) => {
    boardEl.classList.remove("active");
    boardEl.innerHTML = "";
    setTimeout(() => {
      board.forEach((row, r) =>
        row.forEach((cell, c) => {
          const div = document.createElement("div");
          div.className = "cell";
          if (cell.clicked) div.classList.add("clicked");
          if (cell.fixed) div.classList.add("fixed");
          div.dataset.r = r;
          div.dataset.c = c;
          div.innerHTML =
            cell.clicked && cell.image
              ? `<img src="${cell.image}" alt="${cell.text}">`
              : cell.text;
          div.addEventListener("click", () => clickCell(r, c));
          boardEl.appendChild(div);
        })
      );
      boardEl.classList.add("active");
    }, 100);
  };

  const loadBoard = async () => {
    const { board, meta } = await api("/api/board");
    renderBoard(board);
    if (meta && !sessionStorage.getItem("askedPref")) {
      prefModal.classList.add("active");
    }
  };

  const clickCell = async (r, c) => {
    const res = await api("/api/click", {
      method: "POST",
      body: JSON.stringify({ row: r, col: c }),
    });
    renderBoard(res.board);
    if (res.completed) {
      statusEl.textContent =
        "🎉 Bingo complete! Show your screen at the booth!";
    }
  };

  // Modal logic
  yesPref.addEventListener("click", async () => {
    await api("/api/preference", {
      method: "POST",
      body: JSON.stringify({ preference: true }),
    });
    prefModal.classList.remove("active");
    sessionStorage.setItem("askedPref", "1");
  });
  noPref.addEventListener("click", async () => {
    await api("/api/preference", {
      method: "POST",
      body: JSON.stringify({ preference: false }),
    });
    prefModal.classList.remove("active");
    sessionStorage.setItem("askedPref", "1");
  });

  document.getElementById("newBoard").addEventListener("click", () => {
    newModal.classList.add("active");
    confirmNew.disabled = true;
    let countdown = 3;
    newTimerText.textContent = `You can confirm in ${countdown}...`;
    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
        confirmNew.disabled = false;
        newTimerText.textContent = "You may now confirm.";
      } else {
        newTimerText.textContent = `You can confirm in ${countdown}...`;
      }
    }, 1000);
  });
  cancelNew.addEventListener("click", () => {
    newModal.classList.remove("active");
  });
  confirmNew.addEventListener("click", async () => {
    const res = await api("/api/newboard", { method: "POST" });
    if (res.ok) {
      renderBoard(res.board);
      statusEl.textContent = "New board generated. Prize eligibility reset.";
    }
    newModal.classList.remove("active");
  });

  document.getElementById("screenshot").addEventListener("click", () => {
    const clone = boardEl.cloneNode(true);
    clone.style.marginBottom = "40px";
    clone.style.transform = "none";
    document.body.appendChild(clone);
    import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.esm.js")
      .then(({ toPng }) => toPng(clone, { pixelRatio: 2 }))
      .then((dataUrl) => {
        document.body.removeChild(clone);
        const link = document.createElement("a");
        link.download = "bingo.png";
        link.href = dataUrl;
        link.click();
      })
      .catch(() => {
        document.body.removeChild(clone);
        alert("Screenshot failed — ensure images are local and same-origin.");
      });
  });

  await loadBoard();
})();
