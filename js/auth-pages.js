const authRequest = async (path, options) => {
    const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Command center tidak dapat dihubungi.');
    return result;
};

const savePlayerSession = (player, profile = {}) => {
    localStorage.setItem('tc_player_name', player.name);
    localStorage.setItem('tc_authenticated_player', JSON.stringify(player));
    localStorage.setItem(`tc_profile_${player.id || player.name}`, JSON.stringify(profile));
    window.location.href = 'index.html';
};

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const message = document.getElementById('auth-message');
    document.getElementById('auth-code-toggle')?.addEventListener('click', event => {
        const input = document.getElementById('auth-code');
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        event.currentTarget.innerHTML = `<i class="fa-solid fa-eye${visible ? '-slash' : ''}"></i>`;
    });
    loginForm?.addEventListener('submit', async event => {
        event.preventDefault();
        message.textContent = 'Authenticating player...';
        try {
            const result = await authRequest('/api/login', { method: 'POST', body: JSON.stringify({ name: document.getElementById('auth-name').value.trim(), code: document.getElementById('auth-code').value.trim() }) });
            savePlayerSession(result.player);
        } catch (error) { message.textContent = error.message; }
    });
    registerForm?.addEventListener('submit', async event => {
        event.preventDefault();
        message.textContent = 'Creating player profile...';
        try {
            const name = document.getElementById('register-player').value.trim();
            const result = await authRequest('/api/register', { method: 'POST', body: JSON.stringify({ name, code: document.getElementById('register-code').value.trim() }) });
            savePlayerSession(result.player, { email: document.getElementById('register-email').value.trim(), className: document.getElementById('register-class').value });
        } catch (error) { message.textContent = error.message; }
    });
});
