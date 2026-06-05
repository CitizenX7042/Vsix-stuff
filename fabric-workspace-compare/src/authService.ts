import * as vscode from 'vscode';

/**
 * Placeholder authentication service.
 *
 * TODO: Replace with MSAL-based authentication (e.g. @azure/msal-node) to acquire
 * Fabric API tokens via Azure AD. Consider token caching, silent refresh, and
 * scoped permissions (Workspace.Read.All, Item.Read.All, etc.).
 */
export class AuthService {
  /**
   * Prompts the user for a bearer token when none is cached.
   * Returns null if the user cancels the input.
   */
  async getBearerToken(): Promise<string | null> {
    const token = await vscode.window.showInputBox({
      title: 'Microsoft Fabric API Token',
      prompt: 'Enter a bearer token for the Fabric REST API',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIs...',
      validateInput: (value) =>
        value.trim().length === 0 ? 'Token is required.' : undefined,
    });

    return token?.trim() ?? null;
  }
}
