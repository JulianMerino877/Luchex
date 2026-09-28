import { TestBed } from '@angular/core/testing';
import { BrowserQRCodeReader } from '@zxing/browser';
import { BarcodeFormat, QRCodeWriter } from '@zxing/library';
import { extraerCodigoQr, QrScanner } from './qr-scanner';

describe('Escáner QR', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [QrScanner] }).compileComponents();
  });

  it('decodifica un QR real y conserva exactamente su código', () => {
    const codigo = 'REP/001-ABC';
    const matriz = new QRCodeWriter().encode(codigo, BarcodeFormat.QR_CODE, 256, 256, new Map());
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 256, 256);
    context.fillStyle = '#000';
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        if (matriz.get(x, y)) context.fillRect(x, y, 1, 1);
      }
    }
    expect(new BrowserQRCodeReader().decodeFromCanvas(canvas).getText()).toBe(codigo);
  });

  it('conserva una URL completa sin abrirla ni transformarla', () => {
    const url = 'https://ejemplo.com/producto?codigo=REP%2F001-ABC';
    expect(extraerCodigoQr(url)).toBe(url);
  });

  it('conserva exactamente JSON, espacios y códigos de texto', () => {
    expect(extraerCodigoQr('{"nombre":"Filtro","sku":"FIL-123"}')).toBe('{"nombre":"Filtro","sku":"FIL-123"}');
    expect(extraerCodigoQr(' REP/001-ABC ')).toBe(' REP/001-ABC ');
    expect(extraerCodigoQr('   ')).toBeNull();
  });

  it('explica cómo continuar cuando se deniega la cámara', async () => {
    let solicitada!: () => void;
    const solicitud = new Promise<void>(resolve => { solicitada = resolve; });
    const solicitar = spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(async () => {
      solicitada();
      throw new DOMException('Denied', 'NotAllowedError');
    });
    const fixture = TestBed.createComponent(QrScanner);
    fixture.detectChanges();
    await solicitud;
    await new Promise(resolve => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Permite el acceso a la cámara');
    expect(fixture.nativeElement.textContent).toContain('manualmente');
    expect(solicitar).toHaveBeenCalledWith(jasmine.objectContaining({
      video: jasmine.objectContaining({
        facingMode: { ideal: 'environment' },
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      }),
    }));
  });

  it('libera la cámara si el permiso llega después de cerrar el escáner', async () => {
    let resolver!: (stream: MediaStream) => void;
    const solicitud = new Promise<MediaStream>(resolve => { resolver = resolve; });
    let solicitada!: () => void;
    const inicio = new Promise<void>(resolve => { solicitada = resolve; });
    const solicitar = spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => {
      solicitada();
      return solicitud;
    });
    const detener = jasmine.createSpy('stop');
    const stream = { getTracks: () => [{ stop: detener }] } as unknown as MediaStream;
    const fixture = TestBed.createComponent(QrScanner);
    fixture.detectChanges();
    await inicio;
    expect(solicitar).toHaveBeenCalled();
    fixture.destroy();
    resolver(stream);
    await solicitud;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(detener).toHaveBeenCalled();
  });
});
