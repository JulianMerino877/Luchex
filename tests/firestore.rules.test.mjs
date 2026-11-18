import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

let environment;
let db;
const producto = () => ({
  codigo: 'REP/001', nombre: 'Bujía', total: 10,
  creado: serverTimestamp(), creadoPor: 'operador',
});
const referencia = () => doc(db, 'productos', 'codigo_REP%2F001');
const orden = () => ({
  folio: 'OT-2026-001', cliente: 'Ana', telefono: '987654321', moto: 'Honda CB190', estado: 'pendiente',
  observaciones: '', servicios: [{ id: 'servicio-1', nombre: 'Afinamiento', precio: 80 }],
  manoObra: 25, fecha: Timestamp.fromDate(new Date('2026-10-03T12:00:00Z')),
  creado: serverTimestamp(), creadoPor: 'operador',
});
const referenciaOrden = () => doc(db, 'ordenes', 'orden-1');

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-luchex-inventario',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  db = environment.authenticatedContext('operador').firestore();
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());

test('el usuario autenticado crea, consulta, edita y elimina un producto', async () => {
  const ref = referencia();
  await assertSucceeds(setDoc(ref, producto()));
  assert.equal((await assertSucceeds(getDoc(ref))).data().total, 10);
  await assertSucceeds(updateDoc(ref, {
    nombre: '', total: 0, actualizado: serverTimestamp(), actualizadoPor: 'operador',
  }));
  assert.equal((await getDoc(ref)).data().total, 0);
  await assertSucceeds(deleteDoc(ref));
  assert.equal((await getDoc(ref)).exists(), false);
});

test('deniega todas las operaciones sin sesión', async () => {
  await setDoc(referencia(), producto());
  const anon = environment.unauthenticatedContext().firestore();
  const ref = doc(anon, 'productos', 'codigo_REP%2F001');
  await assertFails(getDoc(ref));
  await assertFails(getDocs(collection(anon, 'productos')));
  await assertFails(setDoc(doc(anon, 'productos', 'nuevo'), producto()));
  await assertFails(updateDoc(ref, { total: 3 }));
  await assertFails(deleteDoc(ref));
});

test('rechaza stock inválido, campos extras, códigos vacíos y autor falsificado', async () => {
  for (const cambio of [
    { total: -1 }, { total: 1.5 }, { total: 1000000 }, { total: '10' },
    { codigo: '' }, { codigo: '   ' }, { codigo: 'x'.repeat(4097) },
    { nombre: 'x'.repeat(121) }, { creadoPor: 'otro' }, { extra: true },
  ]) {
    await assertFails(setDoc(referencia(), { ...producto(), ...cambio }));
  }
});

test('preserva la autoría de creación y exige datos de auditoría al editar', async () => {
  await setDoc(referencia(), producto());
  await assertFails(updateDoc(referencia(), { total: 5 }));
  await assertFails(updateDoc(referencia(), {
    creadoPor: 'otro', actualizado: serverTimestamp(), actualizadoPor: 'operador',
  }));
  await assertFails(updateDoc(referencia(), {
    total: 5, actualizado: serverTimestamp(), actualizadoPor: 'otro',
  }));
});

test('otro usuario del taller puede cambiar código por transacción conservando creación', async () => {
  await setDoc(referencia(), producto());
  const original = (await getDoc(referencia())).data();
  const otro = environment.authenticatedContext('segundo').firestore();
  const anterior = doc(otro, 'productos', 'codigo_REP%2F001');
  const nueva = doc(otro, 'productos', 'codigo_NUEVO');
  await assertSucceeds(runTransaction(otro, async transaction => {
    const existente = await transaction.get(anterior);
    await transaction.get(nueva);
    transaction.set(nueva, {
      ...existente.data(), codigo: 'NUEVO', total: 25,
      actualizado: serverTimestamp(), actualizadoPor: 'segundo',
    });
    transaction.delete(anterior);
  }));
  assert.equal((await getDoc(anterior)).exists(), false);
  const guardado = (await getDoc(nueva)).data();
  assert.equal(guardado.creadoPor, 'operador');
  assert.ok(guardado.creado.isEqual(original.creado));
  assert.equal(guardado.total, 25);
});

test('el usuario autenticado crea, consulta y edita una orden', async () => {
  await assertSucceeds(setDoc(referenciaOrden(), orden()));
  assert.equal((await assertSucceeds(getDoc(referenciaOrden()))).data().cliente, 'Ana');
  await assertSucceeds(updateDoc(referenciaOrden(), {
    estado: 'proceso', actualizado: serverTimestamp(), actualizadoPor: 'operador',
  }));
  assert.equal((await getDoc(referenciaOrden())).data().estado, 'proceso');
});

test('deniega órdenes sin sesión y rechaza datos inválidos', async () => {
  const anon = environment.unauthenticatedContext().firestore();
  await assertFails(getDocs(collection(anon, 'ordenes')));
  await assertFails(setDoc(doc(anon, 'ordenes', 'anonima'), orden()));
  await assertFails(setDoc(referenciaOrden(), { ...orden(), estado: 'desconocido' }));
  await assertFails(setDoc(referenciaOrden(), { ...orden(), cliente: '' }));
  await assertFails(setDoc(referenciaOrden(), { ...orden(), telefono: '1'.repeat(21) }));
  await assertFails(setDoc(referenciaOrden(), { ...orden(), creadoPor: 'otro' }));
});

test('preserva la autoría de la orden y no permite eliminarla', async () => {
  await setDoc(referenciaOrden(), orden());
  await assertFails(updateDoc(referenciaOrden(), { estado: 'listo' }));
  await assertFails(updateDoc(referenciaOrden(), {
    creadoPor: 'otro', actualizado: serverTimestamp(), actualizadoPor: 'operador',
  }));
  await assertFails(deleteDoc(referenciaOrden()));
});
