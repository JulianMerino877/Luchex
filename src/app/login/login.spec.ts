import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { Login } from './login';

describe('Login', () => {
  const auth = {
    user: signal(null),
    loading: signal(false),
    configurationError: signal(''),
    login: jasmine.createSpy('login'),
    logout: jasmine.createSpy('logout'),
  };

  beforeEach(async () => {
    auth.login.calls.reset();
    auth.login.and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();
  });

  function setup(email: string, password: string) {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    for (const [id, value] of [['email', email], ['password', password]]) {
      const input = element.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    return { fixture, element };
  }

  it('rejects invalid fields before calling Firebase', () => {
    const { element } = setup('invalid', '123');
    expect(auth.login).not.toHaveBeenCalled();
    expect(element.querySelector('#email-error')).toBeTruthy();
    expect(element.querySelector('#password-error')).toBeTruthy();
  });

  it('shows a Spanish error and enables retry when credentials are rejected', async () => {
    auth.login.and.rejectWith({ code: 'auth/invalid-credential' });
    const { fixture, element } = setup('usuario@example.com', 'incorrecta');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('El correo o la contraseña son incorrectos.');
    expect(element.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBeFalse();
  });

  it('passes credentials to Firebase and clears the password after success', async () => {
    const { fixture, element } = setup('usuario@example.com', 'test-password');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(auth.login).toHaveBeenCalledOnceWith('usuario@example.com', 'test-password');
    expect(element.querySelector<HTMLInputElement>('#password')!.value).toBe('');
  });
});
