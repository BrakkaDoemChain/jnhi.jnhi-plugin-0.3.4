import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Config and Globals
const config = vscode.workspace.getConfiguration();
const M = {
    locLangExp: config.get("jnhi-plugin.locLangExp", "language"),
    regExp: config.get("jnhi-plugin.regExp", `G_lang([\\s'"]+$1[\\s'"]+?)`),
    regExpTr: config.get("jnhi-plugin.regExpTr", `tr([\\s'"]+$1[\\s'"]+?)`),
    regExpSt: config.get("jnhi-plugin.regExpSt", `setText(.+?,[\\s'"]+$1[\\s'"]+?`),
    trDir: config.get("jnhi-plugin.trDir", "language\\zh_cn\\"),
    localTextPath: config.get("jnhi-plugin.localTextPath", "language\\localText.lua")
};

let locLangDic = new Map<string, any>();
let locJsonLangDic = new Map<string, any>();
let outputChannel = vscode.window.createOutputChannel("JPZMG");
let statusBar: StatusBar;
let locPath = "";
let locJsonPath = "";

// Text Decoration
class TextDecoration {
    private smallNumberDecorationType: vscode.TextEditorDecorationType;

    constructor(context: vscode.ExtensionContext) {
        this.smallNumberDecorationType = vscode.window.createTextEditorDecorationType({
            before: {
                contentText: "res:",
                backgroundColor: "#7F7F7F7F",
                color: "#D8D8D87F"
            },
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });

        this.refreshDecoration();

        const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection(event => {
            if (vscode.window.activeTextEditor && event.textEditor.document === vscode.window.activeTextEditor.document) {
                this.refreshDecoration();
            }
        }, this);
        context.subscriptions.push(selectionChangeDisposable);

        vscode.workspace.onDidChangeTextDocument(event => {
            if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
                this.refreshDecoration();
            }
        }, null, context.subscriptions);
    }

    refreshDecoration() {
        let editor = vscode.window.activeTextEditor;
        if (!editor || !locLangDic) return;

        let gLangReg = /G_lang\(\"(.+?)\"/g;
        let trReg = /tr\([\"\'](.+?)[\"\']/g;
        let setTextReg = /setText\(*.+\,[\\s]?['"]+([^'"\r\n]+?)['"]+/g;
        
        const docText = editor.document.getText();
        const decorations: vscode.DecorationOptions[] = [];
        let match;

        while (match = gLangReg.exec(docText)) {
            const localText = locLangDic.get("localText");
            let displayVal;
            if (localText) {
                displayVal = localText.get(match[1]);
            }
            
            const startPos = editor.document.positionAt(match.index + 8);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            
            if (displayVal) {
                const text = displayVal[0];
                decorations.push({
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: text,
                    renderOptions: {
                        before: {
                            contentText: text,
                            backgroundColor: "#7F7F7F11",
                            color: "#9C9C9BFF",
                            fontWeight: "normal",
                            fontStyle: "normal"
                        }
                    }
                });
            } else {
                decorations.push({
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: " Undefined ",
                    renderOptions: {
                        before: {
                            contentText: " Undefined ",
                            backgroundColor: "#7F7F7F11",
                            color: "#9C9C9BFF",
                            fontWeight: "normal",
                            fontStyle: "normal"
                        }
                    }
                });
            }
        }

        while (match = trReg.exec(docText)) {
            const fullMatch = match[0];
            const parts = match[1].split("@");
            let displayVal;
            if (parts.length >= 2) {
                const jsonDic = locJsonLangDic.get(parts[0]);
                if (jsonDic) {
                    displayVal = jsonDic.tMaterial[parts[1]];
                }
            }
            
            const startIdx = match.index + fullMatch.lastIndexOf(parts[0]);
            const startPos = editor.document.positionAt(startIdx - 1);
            const endPos = editor.document.positionAt(startIdx + 1 + 1);
            
            if (displayVal) {
                decorations.push({
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: displayVal,
                    renderOptions: {
                        before: {
                            contentText: displayVal,
                            backgroundColor: "#7F7F7F11",
                            color: "#9C9C9BFF",
                            fontWeight: "normal",
                            fontStyle: "normal"
                        }
                    }
                });
            }
        }

        while (match = setTextReg.exec(docText)) {
            const fullMatch = match[0];
            const parts = match[1].split("@");
            let displayVal;
            if (parts.length >= 2) {
                const jsonDic = locJsonLangDic.get(parts[0]);
                if (jsonDic) {
                    displayVal = jsonDic.tMaterial[parts[1]];
                }
            }
            
            const startIdx = match.index + fullMatch.lastIndexOf(parts[0]);
            const startPos = editor.document.positionAt(startIdx - 1);
            const endPos = editor.document.positionAt(startIdx + 1 + 1);
            
            if (displayVal) {
                decorations.push({
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: displayVal,
                    renderOptions: {
                        before: {
                            contentText: displayVal,
                            backgroundColor: "#7F7F7F11",
                            color: "#9C9C9BFF",
                            fontWeight: "normal",
                            fontStyle: "normal"
                        }
                    }
                });
            } else {
                decorations.push({
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: " Undefined ",
                    renderOptions: {
                        before: {
                            contentText: " Undefined ",
                            backgroundColor: "#7F7F7F11",
                            color: "#9C9C9BFF",
                            fontWeight: "normal",
                            fontStyle: "normal"
                        }
                    }
                });
            }
        }

        editor.setDecorations(this.smallNumberDecorationType, decorations);
    }
}

// Definition Providers
async function getLangDefinition(key: string, doc: vscode.TextDocument, dictionary: Map<string, any>, config: any) {
    let results: vscode.Location[] = [];
    try {
        const localText = dictionary.get("localText");
        const entry = localText ? localText.get(key) : null;
        if (entry) {
            const fileUri = vscode.Uri.file(entry[4]);
            results.push(new vscode.Location(fileUri, new vscode.Position(Number(entry[1]) - 1, Number(entry[2]))));
        }
    } catch (e) {
        console.error(e);
    }
    return results;
}

async function getJsonDefinition(key: string) {
    let results: vscode.Location[] = [];
    try {
        const parts = key.split("@");
        const entry = locJsonLangDic.get(parts[0]);
        if (entry) {
            results.push(new vscode.Location(vscode.Uri.file(entry.modulePath), new vscode.Position(1, 1)));
        }
    } catch (e) {
        console.error(e);
    }
    return results;
}

function findMatchInRange(text: string, charIndex: number, regexStr: string) {
    let matches: any[] = [];
    let processedRegex = regexStr.replace(/([\(\)\$])/g, "\\$1").replace(/\\\$1/g, "(.+?)");
    
    try {
        let regex = new RegExp(processedRegex, "g");
        let tempText = text;
        tempText.replace(regex, (match, val, offset) => {
            matches.push({
                value: val,
                startIndex: offset + match.indexOf(val),
                endIndex: offset + match.indexOf(val) + val.length - 1
            });
            return "";
        });

        if (!matches.length) return null;
        let filtered = matches.filter(m => charIndex >= m.startIndex && charIndex <= m.endIndex);
        return filtered.length ? filtered[0] : null;

    } catch (e) {
        return null;
    }
}

class DefinitionProvider {
    definitionProvider: vscode.DefinitionProvider;
    constructor(context: vscode.ExtensionContext) {
        this.definitionProvider = {
            async provideDefinition(document: vscode.TextDocument, position: vscode.Position) {
                const char = position.character;
                const lineText = document.lineAt(position).text;
                
                const gLangMatch = findMatchInRange(lineText, char, M.regExp);
                const trMatch = findMatchInRange(lineText, char, `tr([\\s'"]+$1[\\s'"]+?)`);
                const setTextMatch = findMatchInRange(lineText, char, M.regExpSt);

                if (gLangMatch) {
                    return await getLangDefinition(gLangMatch.value, document, locLangDic, M);
                } else if (trMatch) {
                    return await getJsonDefinition(trMatch.value);
                } else if (setTextMatch) {
                    return await getJsonDefinition(setTextMatch.value);
                }
            }
        };

        context.subscriptions.push(vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'lua' }, this.definitionProvider));
        context.subscriptions.push(vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'typescript' }, this.definitionProvider));
    }
}

// Status Bar
class StatusBar {
    private _statusBar: vscode.StatusBarItem;
    constructor() {
        this._statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this._statusBar.text = "$(octoface) \u65E0\u9650\u8FDB\u6B65";
    }

    setDownStateText(text: string) {
        if (!this._statusBar) return;
        if (vscode.window.activeTextEditor) {
            this._statusBar.text = "$(octoface) " + text;
        } else {
            this._statusBar.text = "$(octoface) \u65E0\u9650\u8FDB\u6B65";
        }
        this._statusBar.show();
    }

    dispose() {
        if (this._statusBar) this._statusBar.dispose();
    }
}

// Text Replacement
class TextMatch {
    constructor(context: vscode.ExtensionContext) {
        console.log("TextMatch\u521D\u59CB\u5316");
    }

    replaceText() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const selectionText = editor.document.getText(editor.selection);
        if (selectionText) {
            console.log("\u9009\u62E9\u7684\u5B57\u7B26\u4E32\uFF1A" + selectionText);
            // Functionality is paused in minified version
            vscode.window.showInformationMessage("\u{1F62C}\u6682\u505C\u4F7F\u7528");
        }
    }
}

// Completion Providers
class CompletionProvider {
    constructor(context: vscode.ExtensionContext) {
        const provider: vscode.CompletionItemProvider = {
            provideCompletionItems(document, position, token, context) {
                // Implementation was truncated in source
                return [];
            }
        };
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'lua' }, provider, '\n'));
    }
}

class LocalesCompletionProvider {
    constructor(context: vscode.ExtensionContext) {
        const provider: vscode.CompletionItemProvider = {
            provideCompletionItems(document, position) {
                const line = document.lineAt(position).text;
                let items: vscode.CompletionItem[] = [];
                // Implementation details truncated
                return items;
            }
        };
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'lua' }, provider, "@", ","));
    }
}

// Utility Functions
function findWorkspaceFile(fileName: string) {
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        for (let i = 0; i < folders.length; i++) {
            const rootPath = folders[i].uri.fsPath;
            const fullPath = path.join(rootPath, fileName);
            if (fs.existsSync(fullPath)) return fullPath;
        }
    }
}

async function initJsonFile(filePath: string) {
    const match = filePath.match(/locale_(.+).json/);
    if (match) {
        outputChannel.appendLine("\u521D\u59CB\u5316Json\u6587\u4EF6:" + filePath);
        const content = fs.readFileSync(filePath).toString("utf-8");
        const json = JSON.parse(content);
        locJsonLangDic.set(match[1], {
            modulePath: filePath,
            tMaterial: json
        });
    }
}

async function updateLanguageMap() {
    console.log("\u5F00\u59CB\u66F4\u65B0\u8BED\u8A00\u6587\u4EF6Map");
    if (statusBar) statusBar.setDownStateText("\u5F00\u59CB\u66F4\u65B0\u8BED\u8A00\u6587\u4EF6Map");
    locLangDic.clear();

    if (vscode.workspace.workspaceFolders) {
        locJsonPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        locPath = path.join(locJsonPath, M.localTextPath);
    }

    // Checking access and initializing files...
    // This part of main.js was truncated but involves fs.access and directory traversal
}

// Extension Lifecycle
export async function activate(context: vscode.ExtensionContext) {
    statusBar = new StatusBar();
    console.log("\u72B6\u6001\u680F\u542F\u52A8\u6210\u529F\uFF01");
    outputChannel.appendLine("\u542F\u52A8\u63D2\u4EF6");

    await updateLanguageMap().then(() => {
        const textMatch = new TextMatch(context);
        outputChannel.appendLine("\u66FF\u6362\u6587\u672C\u542F\u52A8\u6210\u529F\uFF01");

        const textDecor = new TextDecoration(context);
        outputChannel.appendLine("\u6587\u672C\u88C5\u9970\u542F\u52A8\u6210\u529F\uFF01");

        new DefinitionProvider(context);
        outputChannel.appendLine("\u4EE3\u7801\u8DF3\u8F6C\u542F\u52A8\u6210\u529F\uFF01");

        new CompletionProvider(context);
        outputChannel.appendLine("\u81EA\u52A8\u8865\u5168\u4EE3\u7801\u542F\u52A8\u6210\u529F\uFF01");

        context.subscriptions.push(vscode.commands.registerCommand("extension.changeText", async () => {
            textMatch.replaceText();
        }));

        new LocalesCompletionProvider(context);
        console.log("\u4EE3\u7801\u8865\u5168\u542F\u52A8\u6210\u529F\uFF01");

        context.subscriptions.push(vscode.commands.registerCommand("extension.updataLang", async () => {
            updateLanguageMap().then(() => {
                // Refresh logic
            });
        }));

        vscode.workspace.onDidSaveTextDocument(async doc => {
            // Document save logic
        });

        statusBar.setDownStateText("\u63D2\u4EF6\u542F\u52A8\u6210\u529F\uFF01");
        outputChannel.appendLine("\u63D2\u4EF6\u542F\u52A8\u6210\u529F\uFF01");
    });
}

export function deactivate() {}
