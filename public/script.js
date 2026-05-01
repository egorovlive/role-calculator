const authPanel = document.querySelector("#authPanel");
const calculator = document.querySelector("#calculator");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const usernameInput = document.querySelector("#username");
const passwordInput = document.querySelector("#password");
const currentUser = document.querySelector("#currentUser");
const currentRole = document.querySelector("#currentRole");
const logoutButton = document.querySelector("#logoutButton");
const display = document.querySelector("#display");
const expression = document.querySelector("#expression");
const keys = document.querySelector(".keys");

const state = {
  current: "0",
  previous: null,
  operator: null,
  waitingForNextNumber: false,
  user: null,
};

const operatorLabels = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
};

function updateDisplay() {
  display.textContent = state.current;
  expression.textContent =
    state.previous !== null && state.operator
      ? `${state.previous} ${operatorLabels[state.operator]}`
      : "";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (response.status === 204) {
    return {};
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Ошибка запроса");
  }

  return data;
}

async function restoreSession() {
  try {
    const data = await api("/api/me");
    state.user = data.user;
    showCalculator();
  } catch (error) {
    showLogin();
  }
}

async function logIn(username, password) {
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    state.user = data.user;
    loginError.textContent = "";
    loginForm.reset();
    clearCalculator();
    showCalculator();
  } catch (error) {
    loginError.textContent = error.message;
  }
}

async function logOut() {
  try {
    await api("/api/logout", { method: "POST" });
  } finally {
    state.user = null;
    clearCalculator();
    showLogin();
  }
}

function showCalculator() {
  authPanel.classList.add("hidden");
  calculator.classList.remove("hidden");
  currentUser.textContent = state.user.name;
  currentRole.textContent = state.user.role;
  updateOperatorAccess();
}

function showLogin() {
  calculator.classList.add("hidden");
  authPanel.classList.remove("hidden");
  usernameInput.focus();
}

function canUseOperator(operator) {
  return Boolean(state.user?.allowedOperators.includes(operator));
}

function updateOperatorAccess() {
  document.querySelectorAll("[data-operator]").forEach((button) => {
    const isAllowed = canUseOperator(button.dataset.operator);
    button.disabled = !isAllowed;
    button.title = isAllowed ? "" : "Недоступно для роли Пользователь";
    button.setAttribute("aria-disabled", String(!isAllowed));
  });
}

function inputNumber(value) {
  if (!state.user) {
    return;
  }

  if (state.current === "Ошибка") {
    clearCalculator();
  }

  if (state.waitingForNextNumber) {
    state.current = value === "." ? "0." : value;
    state.waitingForNextNumber = false;
    updateDisplay();
    return;
  }

  if (value === "." && state.current.includes(".")) {
    return;
  }

  state.current = state.current === "0" && value !== "." ? value : state.current + value;
  updateDisplay();
}

async function chooseOperator(nextOperator) {
  if (!state.user || state.current === "Ошибка" || !canUseOperator(nextOperator)) {
    return;
  }

  const inputValue = Number(state.current);

  if (state.operator && state.waitingForNextNumber) {
    state.operator = nextOperator;
    updateDisplay();
    return;
  }

  if (state.previous === null) {
    state.previous = inputValue;
  } else if (state.operator) {
    const didCalculate = await performCalculation({ keepOperator: true });

    if (!didCalculate) {
      return;
    }

    state.previous = Number(state.current);
  }

  state.operator = nextOperator;
  state.waitingForNextNumber = true;
  updateDisplay();
}

async function performCalculation(options = {}) {
  if (
    !state.user ||
    !state.operator ||
    !canUseOperator(state.operator) ||
    state.previous === null ||
    state.waitingForNextNumber
  ) {
    return false;
  }

  try {
    const data = await api("/api/calculate", {
      method: "POST",
      body: JSON.stringify({
        first: state.previous,
        second: Number(state.current),
        operator: state.operator,
      }),
    });

    state.current = data.result;
    state.previous = options.keepOperator ? Number(data.result) : null;
    state.operator = options.keepOperator ? state.operator : null;
    state.waitingForNextNumber = true;
    updateDisplay();
    return true;
  } catch (error) {
    state.current = error.message;
    state.previous = null;
    state.operator = null;
    state.waitingForNextNumber = true;
    updateDisplay();
    return false;
  }
}

function clearCalculator() {
  state.current = "0";
  state.previous = null;
  state.operator = null;
  state.waitingForNextNumber = false;
  updateDisplay();
}

function deleteLastDigit() {
  if (!state.user) {
    return;
  }

  if (state.waitingForNextNumber || state.current === "Ошибка") {
    return;
  }

  state.current = state.current.length > 1 ? state.current.slice(0, -1) : "0";
  updateDisplay();
}

keys.addEventListener("click", async (event) => {
  const button = event.target.closest("button");

  if (!button) {
    return;
  }

  if (button.dataset.number) {
    inputNumber(button.dataset.number);
  }

  if (button.dataset.operator) {
    await chooseOperator(button.dataset.operator);
  }

  if (button.dataset.action === "calculate") {
    await performCalculation();
  }

  if (button.dataset.action === "clear") {
    clearCalculator();
  }

  if (button.dataset.action === "delete") {
    deleteLastDigit();
  }
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  logIn(usernameInput.value.trim(), passwordInput.value);
});

logoutButton.addEventListener("click", logOut);

document.addEventListener("keydown", async (event) => {
  if (!state.user) {
    return;
  }

  if (/^\d$/.test(event.key) || event.key === ".") {
    inputNumber(event.key);
  }

  if (["+", "-", "*", "/"].includes(event.key)) {
    await chooseOperator(event.key);
  }

  if (event.key === "Enter" || event.key === "=") {
    event.preventDefault();
    await performCalculation();
  }

  if (event.key === "Backspace") {
    deleteLastDigit();
  }

  if (event.key === "Escape") {
    clearCalculator();
  }
});

updateDisplay();
restoreSession();
