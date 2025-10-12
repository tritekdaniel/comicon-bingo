(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  // Preference modal
  const prefModal = document.getElementById("prefModal");
  const yesPref = document.getElementById("yesPref");
  const noPref = document.getElementById("noPref");

  // New board modal
  const newModal = document.getElementById("newModal");
  const confirmNew = document.getElementById("confirmNew");
  const cancelNew = document.getElementById("cancelNew");
  const newTimerText = document.getElementById("newTimerText");
  const newBoardBtn = document.getElementById("newBoard");

  // Utility API helper
  const api = async (path, opts = {}) => {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    // try parse json even on non-2xx so we can show message
    let payload;
    try { payload = await res.json(); } catch (e) { payload = null; }
    if (!res.ok) throw { status: res.status, payload };
    return payload;
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
        div.innerHTML =
          cell.clicked && cell.image
            ? `<img src="${cell.image}" alt="${cell.text}">`
            : cell.text;
        div.addEventListener("click", () => clickCell(r, c));
        boardEl.appendChild(div);
      })
    );
  };

  const loadBoard = async () => {
    try {
      const { board, meta } = await api("/api/board");
      boardEl.classList.add("fade-out");
      setTimeout(() => {
        renderBoard(board);
        boardEl.classList.remove("fade-out");
        boardEl.classList.add("fade-in");
      }, 300);
      if (meta && !sessionStorage.getItem("askedPref")) {
        prefModal.classList.add("active");
      }
    } catch (err) {
      console.error("loadBoard error", err);
      statusEl.textContent = "Failed to load board.";
    }
  };

  const clickCell = async (r, c) => {
    try {
      const res = await api("/api/click", {
        method: "POST",
        body: JSON.stringify({ row: r, col: c }),
      });
      renderBoard(res.board);
      if (res.completed) {
        statusEl.textContent = "🎉 Bingo complete! Show your screen at the booth!";
        if (confirm("You finished! Save a screenshot?")) takeScreenshot();
      }
    } catch (err) {
      console.error("clickCell error", err);
      statusEl.textContent = "Could not mark square. Try again.";
      setTimeout(() => (statusEl.textContent = ""), 2500);
    }
  };

  const takeScreenshot = () => {
    import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm")
      .then(({ toPng }) => {
  const wrapper = document.createElement('div');
  wrapper.style.padding = '0 0 20px 0';  // Bottom padding
  wrapper.appendChild(boardEl.cloneNode(true));  // Clone to avoid moving the real board
  document.body.appendChild(wrapper);  // Temporarily add to DOM for accurate rendering
  return toPng(wrapper).finally(() => wrapper.remove());  // Clean up after
})
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = "bingo.png";
        link.href = dataUrl;
        link.click();
      })
      .catch((e) => {
        console.error("screenshot error", e);
        alert("Screenshot failed — ensure images are local and same-origin.");
      });
  };

  // Preference modal logic
  yesPref.addEventListener("click", async () => {
    try {
      await api("/api/preference", {
        method: "POST",
        body: JSON.stringify({ preference: true }),
      });
      prefModal.classList.remove("active");
      sessionStorage.setItem("askedPref", "1");
    } catch (err) {
      console.error("pref save error", err);
      alert("Failed to save preference.");
    }
  });
  noPref.addEventListener("click", async () => {
    try {
      await api("/api/preference", {
        method: "POST",
        body: JSON.stringify({ preference: false }),
      });
      prefModal.classList.remove("active");
      sessionStorage.setItem("askedPref", "1");
    } catch (err) {
      console.error("pref save error", err);
      alert("Failed to save preference.");
    }
  });

  // === NEW BOARD LOGIC (robust) ===
  let newCountdownTimer = null;
  function clearNewCountdown() {
    if (newCountdownTimer) {
      clearInterval(newCountdownTimer);
      newCountdownTimer = null;
    }
  }

  newBoardBtn.addEventListener("click", () => {
    // disable the top-level New Board button so user can't re-open modal repeatedly
    newBoardBtn.disabled = true;

    // show modal
    newModal.classList.add("active");
    confirmNew.disabled = true;
    let countdown = 3;
    newTimerText.textContent = `You can confirm in ${countdown}...`;

    // make sure any previous timer is cleared
    clearNewCountdown();

    newCountdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearNewCountdown();
        confirmNew.disabled = false;
        newTimerText.textContent = "You may now confirm.";
      } else {
        newTimerText.textContent = `You can confirm in ${countdown}...`;
      }
    }, 1000);
  });

  // Cancel handler - clear timers and re-enable newBoardBtn
  cancelNew.addEventListener("click", () => {
    clearNewCountdown();
    confirmNew.disabled = true;
    newModal.classList.remove("active");
    newBoardBtn.disabled = false;
  });

  // Confirm handler - call server, show loading state, handle errors
  confirmNew.addEventListener("click", async () => {
    if (confirmNew.disabled) return;
    // visual loading
    confirmNew.textContent = "Working...";
    confirmNew.disabled = true;
    cancelNew.disabled = true;
    statusEl.textContent = "Generating new board...";
    try {
      const res = await api("/api/newboard", { method: "POST" });
      if (res && res.ok) {
        // small fade animation
        boardEl.classList.add("fade-out");
        setTimeout(() => {
          renderBoard(res.board);
          boardEl.classList.remove("fade-out");
          boardEl.classList.add("fade-in");
          statusEl.textContent = "New board generated. Prize eligibility reset.";
        }, 300);
      } else {
        const msg = (res && res.error) || "Server did not return new board.";
        statusEl.textContent = msg;
      }
    } catch (err) {
      console.error("newboard error", err);
      const message = err?.payload?.error || (err?.message ? err.message : "Network/server error");
      statusEl.textContent = `Failed: ${message}`;
      alert(`Could not generate new board: ${message}`);
    } finally {
      // restore modal/button states
      clearNewCountdown();
      confirmNew.textContent = "OK";
      confirmNew.disabled = true;
      cancelNew.disabled = false;
      newModal.classList.remove("active");
      newBoardBtn.disabled = false;
      setTimeout(() => (statusEl.textContent = ""), 4000);
    }
  });

  // Buttons
  document.getElementById("reset").addEventListener("click", loadBoard);
  document.getElementById("screenshot").addEventListener("click", takeScreenshot);

  // initial load
  await loadBoard();
})();