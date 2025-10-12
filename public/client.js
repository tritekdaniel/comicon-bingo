(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  // Modals
  const prefModal = document.getElementById("prefModal");
  const yesPref = document.getElementById("yesPref");
  const noPref = document.getElementById("noPref");
  const newModal = document.getElementById("newModal");
  const confirmNew = document.getElementById("confirmNew");
  const cancelNew = document.getElementById("cancelNew");
  const newTimerText = document.getElementById("newTimerText");

  // Assign persistent token per browser
  let clientToken = localStorage.getItem("bingo_token");
  if (!clientToken) {
    clientToken = crypto.randomUUID();
    localStorage.setItem("bingo_token", clientToken);
  }

  // API helper
  const api = async (path, opts = {}) => {
    const headers = Object.assign({}, opts.headers || {}, {
      "Content-Type": "application/json",
      "x-bingo-token": clientToken,
    });
    const res = await fetch(path, { ...opts, headers });
    return res.json();
  };

  let currentBoard = null;

  const renderBoard = (board) => {
    currentBoard = board;
    boardEl.innerHTML = "";
    board.forEach((row, r) =>
      row.forEach((cell, c) => {
        const div = document.createElement("div");
        div.className = "cell";
        if (cell.clicked) div.classList.add("clicked");
        if (cell.fixed) div.classList.add("fixed");
        div.dataset.r = r;
        div.dataset.c = c;
        // Show text before click, image after click
        div.innerHTML = cell.clicked && cell.image
          ? `<img src="${cell.image}" alt="${cell.text}">`
          : cell.text;
        div.addEventListener("click", () => clickCell(r, c));
        boardEl.appendChild(div);
      })
    );
  };

  const loadBoard = async () => {
    const { board, meta } = await api("/api/board");
    boardEl.style.opacity = "0";
    setTimeout(() => {
      renderBoard(board);
      boardEl.style.opacity = "1";
    }, 200);
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

  // Preference modal
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

  // New board modal logic
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

  // Extra buttons
  document.getElementById("reset").addEventListener("click", loadBoard);
  document.getElementById("screenshot").addEventListener("click", () => {
    import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm")
      .then(({ toPng }) => toPng(boardEl))
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = "bingo.png";
        link.href = dataUrl;
        link.click();
      })
      .catch(() =>
        alert("Screenshot failed — ensure images are local and same-origin.")
      );
  });

  await loadBoard();
})();
