
    // Redirect if already logged in
    if (api.isLoggedIn()) window.location.href = "/packages.html";

    function showError(message) {
      const banner = document.getElementById("error-banner");
      banner.textContent = message;
      banner.classList.remove("hidden");
    }

    function switchTab(tab) {
      const isLogin = tab === "login";
      document.getElementById("login-form").classList.toggle("hidden", !isLogin);
      document.getElementById("register-form").classList.toggle("hidden", isLogin);
      document.getElementById("tab-login").className =
        `flex-1 py-2 rounded-lg text-sm font-bold transition-all ${isLogin ? "bg-cyan-500/20 text-cyan-300" : "text-gray-400"}`;
      document.getElementById("tab-register").className =
        `flex-1 py-2 rounded-lg text-sm font-bold transition-all ${!isLogin ? "bg-cyan-500/20 text-cyan-300" : "text-gray-400"}`;
      document.getElementById("error-banner").classList.add("hidden");
    }

    async function handleLogin(e) {
      e.preventDefault();
      const btn = document.getElementById("login-btn");
      btn.textContent = "Logging in...";
      btn.disabled = true;
      document.getElementById("error-banner").classList.add("hidden");
      try {
        const res = await api.post("/auth/login", {
          phone_number: document.getElementById("login-phone").value.trim(),
          password: document.getElementById("login-password").value,
        }, false);
        api.setSession(res.data.token, res.data.user);
        window.location.href = res.data.user.role === "admin" ? "/admin.html" : "/packages.html";
      } catch (err) {
        showError(err.message || "Login failed. Please check your credentials.");
        btn.textContent = "Login";
        btn.disabled = false;
      }
    }

    async function handleRegister(e) {
      e.preventDefault();
      const btn = document.getElementById("reg-btn");
      btn.textContent = "Creating account...";
      btn.disabled = true;
      document.getElementById("error-banner").classList.add("hidden");
      try {
        const res = await api.post("/auth/register", {
          phone_number: document.getElementById("reg-phone").value.trim(),
          name: document.getElementById("reg-name").value.trim(),
          password: document.getElementById("reg-password").value,
        }, false);
        api.setSession(res.data.token, res.data.user);
        window.location.href = "/packages.html";
      } catch (err) {
        showError(err.message || "Registration failed. Please try again.");
        btn.textContent = "Create Account";
        btn.disabled = false;
      }
    }
  