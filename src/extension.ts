'use strict';

import * as vscode from 'vscode';

import { GpuDependenciesProvider } from './gpuDependencies';

export function activate(context: vscode.ExtensionContext) {

	const rootPath =vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri.fsPath: undefined;
	const gpuDependenciesProvider = new GpuDependenciesProvider(rootPath);
  vscode.window.registerTreeDataProvider('gpuDependencies', gpuDependenciesProvider);
  vscode.commands.registerCommand('gpuDependencies.refreshEntry', () =>
    gpuDependenciesProvider.refresh()
  );
}