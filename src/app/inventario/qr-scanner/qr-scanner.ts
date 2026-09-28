import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, output, signal, ViewChild } from '@angular/core';
import type { DecodeHintType as DecodeHint } from '@zxing/library';

type CameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
};

type CameraConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  torch?: boolean;
  zoom?: number;
};

type LectorCanvas = {
  decodeFromCanvas(canvas: HTMLCanvasElement): {
    getText(): string;
    getBarcodeFormat(): number;
  };
};

export function extraerCodigoQr(contenido: string): string | null {
  return contenido.trim() ? contenido : null;
}

@Component({
  selector: 'app-qr-scanner',
  templateUrl: './qr-scanner.html',
  styleUrl: './qr-scanner.css',
})
export class QrScanner implements AfterViewInit, OnDestroy {
  @ViewChild('video', { static: true }) private video!: ElementRef<HTMLVideoElement>;
  readonly codigoDetectado = output<string>();
  protected readonly estado = signal<'iniciando' | 'escaneando' | 'error'>('iniciando');
  protected readonly error = signal('');
  protected readonly linternaDisponible = signal(false);
  protected readonly linternaEncendida = signal(false);
  protected readonly zoomDisponible = signal(false);
  protected readonly zoom = signal(1);
  protected readonly zoomMinimo = signal(1);
  protected readonly zoomMaximo = signal(1);
  protected readonly zoomPaso = signal(0.1);
  protected readonly avisoLectura = signal('');
  protected readonly analizando = signal(false);
  protected readonly flashCaptura = signal(false);
  protected readonly faseLectura = signal<'' | 'detectado' | 'analizando'>('');
  private stream?: MediaStream;
  private videoTrack?: MediaStreamTrack;
  private temporizadorCaptura?: number;
  private temporizadorEstado?: number;
  private temporizadorConfirmacion?: number;
  private capturando = false;
  private confirmando = false;
  private intento = 0;

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    void this.iniciar();
  }

  protected async iniciar(): Promise<void> {
    this.detener();
    const intento = this.intento;
    this.estado.set('iniciando');
    this.error.set('');
    this.avisoLectura.set('');
    this.faseLectura.set('');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('La cámara necesita HTTPS o localhost. Puedes escribir el código manualmente.');
      }
      const [{ BrowserQRCodeReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ]);
      if (intento !== this.intento) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30 },
        },
      });
      if (intento !== this.intento) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      await this.configurarCamara(stream);
      if (intento !== this.intento) return;
      this.video.nativeElement.srcObject = stream;
      await this.video.nativeElement.play();
      if (intento !== this.intento) return;
      const opciones = new Map<DecodeHint, unknown>([
        [DecodeHintType.TRY_HARDER, true],
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
      ]);
      const lector = new BrowserQRCodeReader(opciones, { delayBetweenScanAttempts: 80 });
      this.estado.set('escaneando');
      this.iniciarAnalisisFotografico(lector, BarcodeFormat.QR_CODE, intento);
    } catch (error) {
      if (intento !== this.intento) return;
      this.detener();
      this.estado.set('error');
      const nombre = error instanceof Error ? error.name : '';
      this.error.set(nombre === 'NotAllowedError'
        ? 'Permite el acceso a la cámara para escanear o ingresa el código manualmente.'
        : nombre === 'NotFoundError'
          ? 'No encontramos una cámara en este dispositivo. Puedes ingresar el código manualmente.'
          : nombre === 'NotReadableError'
            ? 'La cámara está ocupada. Cierra las otras aplicaciones que la estén usando e inténtalo otra vez.'
            : error instanceof Error && error.message.includes('HTTPS')
              ? error.message
              : 'No se pudo iniciar la cámara. Inténtalo otra vez o ingresa el código manualmente.');
    }
  }

  protected async cambiarLinterna(): Promise<void> {
    if (!this.videoTrack || !this.linternaDisponible()) return;
    const encender = !this.linternaEncendida();
    try {
      await this.aplicarOpciones({ torch: encender });
      this.linternaEncendida.set(encender);
    } catch {
      this.linternaDisponible.set(false);
      this.linternaEncendida.set(false);
    }
  }

  protected async cambiarZoom(valor: number): Promise<void> {
    if (!this.videoTrack || !this.zoomDisponible()) return;
    const zoom = Math.min(this.zoomMaximo(), Math.max(this.zoomMinimo(), valor));
    try {
      await this.aplicarOpciones({ zoom });
      this.zoom.set(zoom);
    } catch {
      this.zoomDisponible.set(false);
    }
  }

  private async configurarCamara(stream: MediaStream): Promise<void> {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    this.videoTrack = track;
    const capacidades = track.getCapabilities?.() as CameraCapabilities | undefined;
    const opciones: CameraConstraintSet = {};

    if (capacidades?.focusMode?.includes('continuous')) opciones.focusMode = 'continuous';
    this.linternaDisponible.set(capacidades?.torch === true);

    if (capacidades?.zoom && capacidades.zoom.max > capacidades.zoom.min) {
      const zoomActual = (track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? capacidades.zoom.min;
      const zoomInicial = Math.min(capacidades.zoom.max, Math.max(capacidades.zoom.min, 1.5));
      this.zoomMinimo.set(capacidades.zoom.min);
      this.zoomMaximo.set(capacidades.zoom.max);
      this.zoomPaso.set(capacidades.zoom.step || 0.1);
      this.zoom.set(zoomInicial);
      this.zoomDisponible.set(true);
      if (zoomInicial !== zoomActual) opciones.zoom = zoomInicial;
    }

    if (Object.keys(opciones).length) {
      try {
        await this.aplicarOpciones(opciones);
      } catch {
        // Algunas cámaras anuncian enfoque continuo pero rechazan activarlo.
      }
    }
  }

  private aplicarOpciones(opciones: CameraConstraintSet): Promise<void> {
    return this.videoTrack!.applyConstraints({ advanced: [opciones] });
  }

  private iniciarAnalisisFotografico(lector: LectorCanvas, formatoQr: number, intento: number): void {
    if (!this.videoTrack) return;
    const captura = typeof ImageCapture === 'undefined' ? undefined : new ImageCapture(this.videoTrack);
    this.temporizadorCaptura = window.setInterval(() => {
      void this.analizarFotografia(captura, lector, formatoQr, intento);
    }, 500);
  }

  private async analizarFotografia(
    captura: ImageCapture | undefined,
    lector: LectorCanvas,
    formatoQr: number,
    intento: number,
  ): Promise<void> {
    if (this.capturando || intento !== this.intento) return;
    this.capturando = true;
    this.analizando.set(true);
    let imagen: ImageBitmap | undefined;
    try {
      if (captura) {
        try {
          imagen = await createImageBitmap(await captura.takePhoto());
        } catch {
          // Si takePhoto no está soportado, decodificar el fotograma del video.
        }
        if (intento !== this.intento) return;
      }

      const video = this.video.nativeElement;
      const anchoOrigen = imagen?.width ?? video.videoWidth;
      const altoOrigen = imagen?.height ?? video.videoHeight;
      if (!anchoOrigen || !altoOrigen) return;
      const fuente: CanvasImageSource = imagen ?? video;

      // Este recorte corresponde al cuadro que el usuario ve sobre la cámara.
      const ladoOrigen = Math.round(Math.min(anchoOrigen, altoOrigen) * 0.68);
      const ladoDestino = Math.min(ladoOrigen, 2048);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ladoDestino;
      const contexto = canvas.getContext('2d', { alpha: false });
      if (!contexto) return;
      contexto.imageSmoothingEnabled = true;
      contexto.imageSmoothingQuality = 'high';
      contexto.drawImage(
        fuente,
        Math.round((anchoOrigen - ladoOrigen) / 2),
        Math.round((altoOrigen - ladoOrigen) / 2),
        ladoOrigen,
        ladoOrigen,
        0,
        0,
        ladoDestino,
        ladoDestino,
      );

      const resultado = lector.decodeFromCanvas(canvas);
      if (resultado.getBarcodeFormat() === formatoQr) this.completarLectura(resultado.getText(), intento);
    } catch {
      // Es normal que varias capturas no contengan todavía un QR legible.
    } finally {
      imagen?.close();
      this.capturando = false;
      this.analizando.set(false);
    }
  }

  private completarLectura(contenido: string, intento: number): boolean {
    if (intento !== this.intento) return false;
    if (this.confirmando) return true;
    const codigo = extraerCodigoQr(contenido);
    if (!codigo) {
      this.zone.run(() => this.avisoLectura.set('Ese QR está vacío. Prueba con otro QR.'));
      return false;
    }
    this.confirmando = true;
    if (this.temporizadorCaptura !== undefined) window.clearInterval(this.temporizadorCaptura);
    this.temporizadorCaptura = undefined;
    this.video.nativeElement.pause();
    if (typeof navigator.vibrate === 'function') navigator.vibrate(60);
    this.zone.run(() => {
      this.faseLectura.set('detectado');
      this.flashCaptura.set(true);
    });
    this.temporizadorEstado = window.setTimeout(() => {
      if (intento !== this.intento) return;
      this.zone.run(() => {
        this.flashCaptura.set(false);
        this.faseLectura.set('analizando');
      });
    }, 200);
    this.temporizadorConfirmacion = window.setTimeout(() => {
      if (intento !== this.intento) return;
      this.detener();
      this.zone.run(() => this.codigoDetectado.emit(codigo));
    }, 900);
    return true;
  }

  private detener(): void {
    this.intento++;
    if (this.temporizadorCaptura !== undefined) window.clearInterval(this.temporizadorCaptura);
    this.temporizadorCaptura = undefined;
    if (this.temporizadorEstado !== undefined) window.clearTimeout(this.temporizadorEstado);
    this.temporizadorEstado = undefined;
    if (this.temporizadorConfirmacion !== undefined) window.clearTimeout(this.temporizadorConfirmacion);
    this.temporizadorConfirmacion = undefined;
    this.confirmando = false;
    this.analizando.set(false);
    this.flashCaptura.set(false);
    this.faseLectura.set('');
    if (this.video?.nativeElement) {
      this.video.nativeElement.pause();
      this.video.nativeElement.srcObject = null;
    }
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    this.videoTrack = undefined;
    this.linternaDisponible.set(false);
    this.linternaEncendida.set(false);
    this.zoomDisponible.set(false);
  }

  ngOnDestroy(): void {
    this.detener();
  }
}
