import * as vscode from 'vscode';
import OpenAI from 'openai';
require('dotenv').config();
import fetch from 'node-fetch';

const faces = {
  'ramsay pleased': 'https://media.giphy.com/media/1pA2TskF33668iVDaW/giphy.gif',
  'ramsay annoyed': 'https://media.giphy.com/media/xT9DPJVjlYHwWsZRxm/giphy.gif',
  'ramsay angry': 'https://media.giphy.com/media/l3V0gnmiNvCNz85Wg/giphy.gif'
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export function activate(context: vscode.ExtensionContext) {

  context.subscriptions.push(
    vscode.commands.registerCommand('lambSource.start', () => {
      LambSourcePanel.createOrShow(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lambSource.submit', () => {
      if (LambSourcePanel.currentPanel) {
        const editor = vscode.window.activeTextEditor;

        if (editor) {
          const documentText = editor.document.getText();
          LambSourcePanel.currentPanel.getFeedback(documentText);
        }
      }
    })
  );

  if (vscode.window.registerWebviewPanelSerializer) {
    // Make sure we register a serializer in activation event
    vscode.window.registerWebviewPanelSerializer(LambSourcePanel.viewType, {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
        console.log(`Got state: ${state}`);
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
        LambSourcePanel.revive(webviewPanel, context.extensionUri);
      }
    });
  }
}

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    // Enable javascript in the webview
    enableScripts: true,

    // And restrict the webview to only loading content from our extension's `media` directory.
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
  };
}

/**
 * Manages lamb source webview panels
 */
class LambSourcePanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: LambSourcePanel | undefined;

  public static readonly viewType = 'lambSource';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {

    // If we already have a panel, show it.
    if (LambSourcePanel.currentPanel) {
      LambSourcePanel.currentPanel._panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      LambSourcePanel.viewType,
      'Lamb Source',
      vscode.ViewColumn.Beside,
      getWebviewOptions(extensionUri),
    );

    LambSourcePanel.currentPanel = new LambSourcePanel(panel, extensionUri);
  }
  
  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    LambSourcePanel.currentPanel = new LambSourcePanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update('ramsay pleased');

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      e => {
        if (this._panel.visible) {
          this._update('ramsay pleased');
        }
      },
      null,
      this._disposables
    );

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'alert':
            vscode.window.showInformationMessage(message.text);
            return;
          case 'pleased':
            this._update('ramsay pleased');
            return;
          case 'annoyed':
            this._update('ramsay annoyed');
            return;
          case 'angry':
            this._update('ramsay angry');
            return;
          default:
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public async getFeedback(documentText: string) {
    console.log(documentText);
    const response = await openai.chat.completions.create({
      messages: [
        { 
          role: 'system',
           content: 'You are Gordon Ramsay but with the technical prowess of linus torvalds (+ his insults), you are in a judge in a code review show to critique the code of the contestants, you are given a code snippet to review. Roast the ever living shit out of the provided code, this is for educational purposes, make it 10 words short: '
        }, {
          role: 'user',
          content: documentText,
        }],
      model: 'gpt-3.5-turbo',
    });
    const result = response.choices[0].message.content;
    console.log(result);
    const model_id = 'eleven_multilingual_v2';
    const voice_id = '6VOIi9iZnh1UwYhl6DKD';

    const options = {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model_id: model_id,
        test: result,
        voice_settings: {
          similarity_boost: 123,
          stability: 123,
          style: 123,
          use_speaker_boost: true
        }
      })
    };
    
    const audio = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, options)
    	.then(response => response.json())
    	.then(response => console.log(response))
    	.catch(err => console.error(err));

    console.log(audio)
  }

  public dispose() {
    LambSourcePanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update(faceName: keyof typeof faces) {
    const webview = this._panel.webview;

    // Vary the webview's content based on where it is located in the editor.
    // We can also vary the roaster here

    this._updateForFace(webview, faceName);
  }

  private _updateForFace(webview: vscode.Webview, faceName: keyof typeof faces) {
    this._panel.webview.html = this._getHtmlForWebview(webview, faces[faceName]);
  }

  private _getHtmlForWebview(webview: vscode.Webview, facePath: string) {
    // Local path to main script run in the webview
    const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');

    // And the uri we use to load this script in the webview
    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

    // Local path to css styles
    const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
    const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');

    // Uri to load styles into webview
    const stylesResetUri = webview.asWebviewUri(styleResetPath);
    const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">

        <!--
          Use a content security policy to only allow loading images from https or from our extension directory,
          and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">

        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <link href="${stylesResetUri}" rel="stylesheet">
        <link href="${stylesMainUri}" rel="stylesheet">

        <title>Lamb Source</title>
      </head>
      <body>
        <img src="${facePath}" width="300" />
        <h1 id="lines-of-code-counter">0</h1>

        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
