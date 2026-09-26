import { TestBed } from '@angular/core/testing';
import { Mecanicos } from './mecanicos';

describe('Mecanicos', () => {
  it('should create the component', async () => {
    await TestBed.configureTestingModule({ imports: [Mecanicos] }).compileComponents();
    const fixture = TestBed.createComponent(Mecanicos);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
