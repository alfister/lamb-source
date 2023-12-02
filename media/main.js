// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.

(function () {
    const vscode = acquireVsCodeApi();

    const oldState = /** @type {{ count: number} | undefined} */ (vscode.getState());

    const counter = /** @type {HTMLElement} */ (document.getElementById('lines-of-code-counter'));
    console.log('Initial state', oldState);

    let currentCount = (oldState && oldState.count) || 0;
    counter.textContent = `${currentCount}`;

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.command) {
            case 'feedback':
                vscode.postMessage({
                    command: 'alert',
                    text: 'feedback submitted'
                });
                break;
        }
    });
}());
