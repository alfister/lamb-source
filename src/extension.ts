/* eslint-disable @typescript-eslint/no-var-requires */
import * as vscode from 'vscode';
import OpenAI from 'openai';
require('dotenv').config();
import axios from 'axios';
const audioPlayer = require('play-sound')({});
const fs = require("fs-extra");

const faces: { [key: string]: string } = {
  'ramsay pleased': 'https://media.giphy.com/media/1pA2TskF33668iVDaW/giphy.gif',
  'ramsay disappointed': 'https://media.giphy.com/media/28ewxGSqPxfpjK5mWU/giphy.gif',
  'ramsay disappointed 2': 'https://media.giphy.com/media/VG1uhz0K6cbE3WatUb/giphy.gif',
  'ramsay annoyed': 'https://media.giphy.com/media/W4aKCI7mygvEQ/giphy.gif',
  'ramsay annoyed 2': 'https://media.giphy.com/media/VG2OzjYkBLK9vGf3UH/giphy.gif',
  'ramsay angry': 'https://media.giphy.com/media/l3V0gnmiNvCNz85Wg/giphy.gif'
};

const numberToFaceMap: { [key: number]: string } = {
  1: 'ramsay disappoined',
  2: 'ramsay disappointed 2',
  3: 'ramsay annoyed',
  4: 'ramsay annoyed 2',
  5: 'ramsay angry'
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
    vscode.commands.registerCommand('lambSource.submit', async () => {
      const editor = vscode.window.activeTextEditor;
      if(editor)await vscode.commands.executeCommand('type', { text: '\n' });
      if (LambSourcePanel.currentPanel) {
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
    const ai_response = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are Gordon Ramsay but with the technical prowess of linus torvalds (+ his insults), you are giving quick and short code review advice for a code snippet. Imitate his profanity but replace it with safe words like `freak` instead of `fuck`, `crap` instead of `shit`, and maybe throw in an animal reference (like donkey!). Roast the provided code, this is for educational purposes, make it really short like 10 words SHORT. Additionally, include a sentiment rating, ranging from disappointed (1) to annoyed (3), to extremely irate (5). Respond only with a JSON-formatted object like {"text": "Your code sucks...", "sentiment": 4}.'
        }, {
          role: 'user',
          content: documentText,
        }],
      model: 'gpt-3.5-turbo',
    });
    const {text: result, sentiment} = JSON.parse(ai_response.choices[0].message.content || "{}");
    console.log(sentiment, result);
    const model_id = 'eleven_multilingual_v2';
    const voice_id = '6VOIi9iZnh1UwYhl6DKD';

    this._update(numberToFaceMap[sentiment]);
    try {
      const response = await axios({
        method: "POST",
        url: `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
        data: {
          text: result,
          voice_settings: {
            stability: 1,
            similarity_boost: 1,
            style: 1,
            use_speaker_boost: true,
          },
          model_id: model_id,
        },
        headers: {
          Accept: "audio/mpeg",
          "xi-api-key": process.env.ELEVEN_LABS_API,
          "Content-Type": "application/json",
        },
        responseType: "stream"
      });

      const fileName = "/tmp/audioFile.mp3";

      response.data.pipe(fs.createWriteStream(fileName));

      const writeStream = fs.createWriteStream(fileName);
      response.data.pipe(writeStream);

      const fileOk = await new Promise((resolve, reject) => {
          const responseJson = {
              status: "ok",
              fileName: fileName
          };
          writeStream.on('finish', () => resolve(responseJson));

          writeStream.on('error', reject);
      });


      audioPlayer.play(fileName, function(err: any) {
        if (err) { console.log("error"); }
      });

    } catch (error) {
      console.log(error);
    }
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
