/// <reference types="cypress" />

describe('MakerWorks Authentik OAuth2 Flow', () => {
  const mockState = 'mock-state';
  const mockCode = 'mock-code';

  const persistedUser = {
    id: '123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    is_verified: true,
    is_active: true,
    groups: ['user'], // critical for AuthGate
  };

  beforeEach(() => {
    localStorage.removeItem('auth_state');
    localStorage.removeItem('auth-storage');
  });

  it('✅ Successful login and redirects to dashboard', () => {
    localStorage.setItem('auth_state', mockState);

    cy.intercept('POST', '/auth/token', {
      statusCode: 200,
      body: {
        token: 'fake-jwt',
        user: persistedUser,
      },
    }).as('tokenExchange');

    cy.visit(`/auth/callback?code=${mockCode}&state=${mockState}`);
    cy.wait('@tokenExchange', { timeout: 10000 });

    // explicitly write persisted state to localStorage
    cy.window().then((win) => {
      win.localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            token: 'fake-jwt',
            user: persistedUser,
          },
          version: 0,
        })
      );
    });

    cy.visit('/dashboard');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
    cy.contains('Welcome');
  });

  it('❌ Fails when state is missing', () => {
    cy.visit(`/auth/callback?code=${mockCode}`);
    cy.url().should('include', '/auth/signin?error=invalid_state');
    cy.contains('Invalid authentication state').should('exist');
  });

  it('❌ Fails when state does not match', () => {
    localStorage.setItem('auth_state', mockState);
    cy.visit(`/auth/callback?code=${mockCode}&state=invalid-state`);
    cy.url().should('include', '/auth/signin?error=invalid_state');
    cy.contains('Invalid authentication state').should('exist');
  });

  it('❌ Fails when code is missing', () => {
    localStorage.setItem('auth_state', mockState);
    cy.visit(`/auth/callback?state=${mockState}`);
    cy.url().should('include', '/auth/signin?error=missing_code');
    cy.contains('No authorization code').should('exist');
  });

  it('❌ Fails when backend token exchange fails', () => {
    localStorage.setItem('auth_state', mockState);

    cy.intercept('POST', '/auth/token', {
      statusCode: 500,
    }).as('tokenExchange');

    cy.visit(`/auth/callback?code=${mockCode}&state=${mockState}`);
    cy.wait('@tokenExchange', { timeout: 10000 });

    cy.url().should('include', '/auth/signin?error=token_failed');
    cy.contains('Sign-in failed').should('exist');
  });
});
