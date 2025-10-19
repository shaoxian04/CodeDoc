import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('NP.codedocx'));
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.getExtension('NP.codedocx');
        if (extension) {
            await extension.activate();
            assert.ok(extension.isActive);
        }
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const expectedCommands = [
            'codedoc.openChat',
            'codedoc.clearChat',
            'codedoc.visualizeCode',
            'codedoc.generateDocs',
            'codedoc.configureExtension'
        ];

        for (const command of expectedCommands) {
            assert.ok(commands.includes(command), `Command ${command} should be registered`);
        }
    });
});