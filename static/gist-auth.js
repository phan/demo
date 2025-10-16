/**
 * GitHub Gist Authentication and API Module
 * Implements PKCE OAuth flow and Gist operations
 */

// ============================================================================
// PKCE Helper Functions
// ============================================================================

/**
 * Generate a cryptographically random code verifier for PKCE
 * @returns {string} 43-128 character random string
 */
function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64urlEncode(array);
}

/**
 * Generate SHA-256 code challenge from verifier
 * @param {string} verifier - The code verifier
 * @returns {Promise<string>} Base64url encoded SHA-256 hash
 */
async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return base64urlEncode(new Uint8Array(hash));
}

/**
 * Generate a random state parameter for CSRF protection
 * @returns {string} Random 32-character string
 */
function generateRandomString(length) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return base64urlEncode(array).substring(0, length);
}

/**
 * Base64url encode (URL-safe base64 without padding)
 * @param {Uint8Array} buffer - Buffer to encode
 * @returns {string} Base64url encoded string
 */
function base64urlEncode(buffer) {
    const base64 = btoa(String.fromCharCode.apply(null, buffer));
    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

// ============================================================================
// OAuth Flow Functions
// ============================================================================

/**
 * Show personal access token input modal
 * Due to CORS restrictions, browser-only apps cannot use OAuth flows.
 * Instead, we ask users to create a Personal Access Token.
 */
async function initiateOAuthFlow() {
    showTokenInputModal();
}

/**
 * Show modal for user to input their GitHub Personal Access Token
 */
function showTokenInputModal() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>GitHub Authentication</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: 1em; color: var(--text-primary);">To save gists, you need a GitHub Personal Access Token with <strong>gist</strong> scope.</p>

                <div style="background: var(--bg-secondary); padding: 1em; border-radius: 6px; margin: 1em 0;">
                    <p style="margin: 0 0 0.5em 0; font-weight: 600; color: var(--text-primary);">Steps to create a token:</p>
                    <ol style="margin: 0; padding-left: 1.5em; color: var(--text-secondary);">
                        <li>Visit <a href="https://github.com/settings/tokens/new?scopes=gist&description=Phan%20Demo" target="_blank" style="color: #0d6efd; font-weight: 600;">github.com/settings/tokens/new</a></li>
                        <li>Check the <strong>gist</strong> scope</li>
                        <li>Click "Generate token"</li>
                        <li>Copy the token and paste it below</li>
                    </ol>
                </div>

                <div style="margin: 1.5em 0;">
                    <label style="display: block; margin-bottom: 0.5em; font-weight: 600; color: var(--text-primary);">Personal Access Token:</label>
                    <input type="password" id="token-input" placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style="width: 100%; padding: 0.75em; border: 2px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-family: monospace; font-size: 0.9em;" />
                    <p style="margin: 0.5em 0 0 0; font-size: 0.85em; color: var(--text-tertiary);">Your token is stored locally in your browser and never sent anywhere except GitHub API.</p>
                </div>

                <div style="display: flex; gap: 0.75em; justify-content: flex-end; margin-top: 1.5em;">
                    <button onclick="this.closest('.modal').remove()" style="padding: 0.6em 1.5em; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Cancel</button>
                    <button id="save-token-btn" style="padding: 0.6em 1.5em; background: #0d6efd; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Save Token</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Handle save button
    document.getElementById('save-token-btn').addEventListener('click', async function() {
        const token = document.getElementById('token-input').value.trim();
        if (!token) {
            showToast('Please enter a token', 'error');
            return;
        }

        // Validate token by fetching user info
        try {
            const user = await fetchGitHubUser(token);
            if (user) {
                storeAccessToken(token);
                updateAuthUI(user);
                modal.remove();
                showToast('Successfully authenticated as @' + user.login, 'success');
            } else {
                showToast('Invalid token - could not fetch user info', 'error');
            }
        } catch (error) {
            showToast('Invalid token: ' + error.message, 'error');
        }
    });

    // Allow Enter key to submit
    document.getElementById('token-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('save-token-btn').click();
        }
    });

    // Focus input
    setTimeout(function() {
        document.getElementById('token-input').focus();
    }, 100);
}

/**
 * Fetch GitHub user information
 * @param {string} token - Access token
 * @returns {Promise<object|null>} User object or null on error
 */
async function fetchGitHubUser(token) {
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user info');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching GitHub user:', error);
        return null;
    }
}

// ============================================================================
// Token Storage Functions
// ============================================================================

/**
 * Store access token in localStorage
 * @param {string} token - GitHub access token
 */
function storeAccessToken(token) {
    const data = {
        token: token,
        timestamp: Date.now()
    };
    localStorage.setItem('github_token', JSON.stringify(data));
}

/**
 * Get stored access token if valid
 * @returns {string|null} Access token or null if not found/expired
 */
function getAccessToken() {
    const stored = localStorage.getItem('github_token');
    if (!stored) {
        return null;
    }

    try {
        const data = JSON.parse(stored);
        // Tokens don't expire, but we could add logic here if needed
        return data.token;
    } catch (error) {
        console.error('Error parsing stored token:', error);
        return null;
    }
}

/**
 * Get stored user data from localStorage
 * @returns {object|null} User object or null
 */
function getStoredUser() {
    const stored = localStorage.getItem('github_user');
    if (!stored) {
        return null;
    }

    try {
        return JSON.parse(stored);
    } catch (error) {
        console.error('Error parsing stored user:', error);
        return null;
    }
}

/**
 * Store user data in localStorage
 * @param {object} user - GitHub user object
 */
function storeUser(user) {
    localStorage.setItem('github_user', JSON.stringify(user));
}

/**
 * Clear stored token and user data (logout)
 */
function revokeToken() {
    localStorage.removeItem('github_token');
    localStorage.removeItem('github_user');
}

// ============================================================================
// Gist API Functions
// ============================================================================

/**
 * Create a new GitHub Gist
 * @param {object} gistData - Gist data with files, description, public flag
 * @returns {Promise<object>} Created gist object
 */
async function createGist(gistData) {
    const token = getAccessToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(gistData)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create gist');
    }

    return await response.json();
}

/**
 * Fetch all gists for the authenticated user
 * @param {number} perPage - Number of gists per page (default 30, max 100)
 * @param {number} page - Page number (default 1)
 * @returns {Promise<array>} Array of gist objects
 */
async function fetchUserGists(perPage = 100, page = 1) {
    const token = getAccessToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const response = await fetch(`https://api.github.com/gists?per_page=${perPage}&page=${page}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch gists');
    }

    return await response.json();
}

/**
 * Load a gist by ID and optional revision SHA
 * @param {string} gistId - Gist ID
 * @param {string|null} revisionSha - Optional revision SHA to load a specific version
 * @returns {Promise<object>} Gist object
 */
async function loadGistById(gistId, revisionSha) {
    const token = getAccessToken();
    const headers = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    // Add auth header if available (for private gists)
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // If a revision SHA is specified, fetch that specific revision
    const url = revisionSha
        ? `https://api.github.com/gists/${gistId}/${revisionSha}`
        : `https://api.github.com/gists/${gistId}`;

    const response = await fetch(url, {
        headers: headers
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(revisionSha ? 'Gist revision not found' : 'Gist not found');
        }
        throw new Error('Failed to load gist');
    }

    return await response.json();
}

/**
 * Update an existing gist
 * @param {string} gistId - Gist ID to update
 * @param {object} gistData - Updated gist data
 * @returns {Promise<object>} Updated gist object
 */
async function updateGist(gistId, gistData) {
    const token = getAccessToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(gistData)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update gist');
    }

    return await response.json();
}

// ============================================================================
// UI Helper Functions
// ============================================================================

/**
 * Update authentication UI based on user state
 * @param {object|null} user - GitHub user object or null if logged out
 */
function updateAuthUI(user) {
    const loginBtn = document.getElementById('github-login');
    const userDiv = document.getElementById('github-user');
    const shareBtn = document.getElementById('share-link');

    if (user) {
        // Store user data
        storeUser(user);

        // Hide login button, show user info
        if (loginBtn) loginBtn.style.display = 'none';
        if (userDiv) {
            userDiv.style.display = 'flex';
            userDiv.querySelector('.username').textContent = 'Load';
            userDiv.querySelector('.user-avatar').src = user.avatar_url;
            userDiv.title = 'Load gist from GitHub (@' + user.login + ')';
        }

        // Update share button for logged in state
        if (shareBtn) {
            shareBtn.innerHTML = '💾 Save/Share';
            shareBtn.title = 'Save current state to GitHub Gist and get shareable link';
        }
    } else {
        // Show login button, hide user info
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (userDiv) userDiv.style.display = 'none';

        // Update share button for logged out state
        if (shareBtn) {
            shareBtn.innerHTML = '📋 Share';
            shareBtn.title = 'Copy shareable link';
        }
    }
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error'
 */
function showToast(message, type) {
    // Create toast element if it doesn't exist
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = 'toast toast-' + type + ' toast-show';

    // Auto-hide after 4 seconds
    setTimeout(function() {
        toast.classList.remove('toast-show');
    }, 4000);
}

/**
 * Initialize auth UI on page load
 */
function initAuthUI() {
    const token = getAccessToken();
    const user = getStoredUser();

    if (token && user) {
        updateAuthUI(user);
    } else {
        updateAuthUI(null);
    }
}
