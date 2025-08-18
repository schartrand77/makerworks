// cypress/e2e/auth.cy.ts
describe('authentication without localStorage token', () => {
  it('uses cookie session only', () => {
    const uid = Date.now();
    const email = `e2e-${uid}@example.com`;
    const username = `e2e-${uid}`;
    const password = 'Pass123!';

    cy.request('POST', '/api/v1/auth/signup', {
      email,
      username,
      password,
    });

    cy.request('POST', '/api/v1/auth/signout');

    cy.visit('/auth/signin');
    cy.get('#emailOrUsername').type(email);
    cy.get('#password').type(password);
    cy.get('form').submit();

    cy.getCookie('session').should('exist');
    cy.window().then((win) => {
      expect(win.localStorage.getItem('token')).to.be.null;
    });
  });
});
