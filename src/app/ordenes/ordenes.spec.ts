import { TestBed } from '@angular/core/testing';
import { Ordenes } from './ordenes';

describe('Ordenes', () => {
  it('should create the component', async () => {
    await TestBed.configureTestingModule({ imports: [Ordenes] }).compileComponents();
    const fixture = TestBed.createComponent(Ordenes);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
