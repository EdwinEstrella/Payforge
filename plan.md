# Plan de Desarrollo: Módulo de Contratos y Firma Electrónica

## 🎯 Objetivo
Implementar un módulo en la aplicación de escritorio para la creación, gestión y seguimiento de contratos ("Contratos" y "Contratos Activos"). El flujo permitirá generar un contrato, compartir un enlace único con el cliente, y que este firme digitalmente desde su navegador (celular o PC) usando un canvas. El portal de firma se alojará en un Bucket Público de Insforge Storage.

## 🏗️ Arquitectura del Sistema (Opción Híbrida con Insforge Storage)

```mermaid
graph TD
    A[App Electron (Frontend)] <--> B[Backend Insforge (API/Logic)]
    B <--> C[Base de Datos (PostgreSQL/Insforge)]
    C <--> B
    B <--> F[Insforge Storage (Bucket Público)]
    F <--> G[Portal HTML de Firma]
    G <--> H[Cliente Final (Firma Digital en Canvas)]
    H <--> B
```

El flujo se divide en tres partes principales:

### 1. App Electron (El Panel de Control)
- **Nueva UI "Contratos":** Formulario para crear un nuevo contrato. Seleccionar cliente, definir monto, descripción y redactar los términos del contrato (texto libre/plantilla).
- **Nueva UI "Contratos Activos":** Tabla donde se listan los contratos generados, su estado (`Pendiente`, `Firmado`), el enlace para compartir, y la opción de ver/descargar el documento firmado.
- **Acción:** Al crear, la app envía los datos al backend (Insforge), se genera el registro y se obtiene un enlace único (token) para compartir con el cliente. El enlace apuntará al portal HTML alojado en Insforge Storage.

### 2. Backend (Insforge)
- **Base de Datos:** Nueva tabla `contracts` con campos: `id`, `client_id`, `description`, `amount`, `currency`, `terms`, `status` (pending/signed), `signature_data` (Base64 de la firma), `signed_at`, `ip_address`, `token` (identificador único).
- **Políticas (RLS):**
  - Permitir a la app Electron crear y leer contratos (vía token de administrador o service role).
  - Permitir al portal público consultar los detalles de un contrato específico usando su `token`.
  - Permitir al portal público actualizar un contrato (cambiar estado a `signed` y guardar la firma) usando su `token`.

### 3. Portal de Firma (Frontend Web Cliente)
- **Página HTML Estática (`portal_firma.html`):** Una web responsiva e independiente de la app de escritorio.
- **Hosting:** Alojada manualmente en un bucket público (ej. `portal-firmas`) dentro del Storage de Insforge.
- **Lógica:**
  1. Lee el `token` de la URL (ej. `https://[tu-id].supabase.co/storage/v1/object/public/portal-firmas/portal_firma.html?token=xyz123`).
  2. Consulta a Insforge los detalles del contrato y los muestra en pantalla.
  3. Implementa `signature_pad` (librería JS) para que el cliente firme en un `<canvas>` (con el dedo o el mouse).
  4. Al hacer clic en "Aceptar y Firmar", envía la firma en Base64 al backend de Insforge y actualiza el estado.

## 🚀 Fases de Implementación

### Fase 1: Base de Datos y Backend (Requiere Acción Manual del Usuario)
- [ ] **Usuario:** Ejecutar el siguiente SQL en el editor de Insforge para crear la tabla:
  ```sql
  CREATE TABLE contracts (
      id bigint primary key generated always as identity,
      client_id bigint, -- Si quieres hacer FK a tu tabla clients, agrega: references clients(id)
      description text,
      amount integer,
      currency text,
      terms text,
      status text default 'pending',
      signature_data text,
      signed_at timestamp with time zone,
      ip_address text,
      token uuid default gen_random_uuid(),
      created_at timestamp with time zone default timezone('utc'::text, now()) not null
  );
  ```
- [ ] **Usuario:** Configurar las políticas (RLS) o usar la Service Key en la app (si ya la estamos usando) para gestionar los permisos.

### Fase 2: Portal de Firma Web
- [ ] **IA:** Desarrollar el archivo estático `portal_firma.html` con `signature_pad`, llamadas a la API de Insforge (usando la Anon Key pública) y diseño responsivo.
- [ ] **Usuario:** Crear el bucket público `portal-firmas` en Insforge Storage y subir el archivo `portal_firma.html`.

### Fase 3: Integración en App Electron
- [ ] **IA:** Actualizar `layout.html` y barra lateral para incluir la sección "Contratos".
- [ ] **IA:** Crear `contracts_content.html` con la interfaz para redactar (formulario) y listar contratos activos (tabla).
- [ ] **IA:** Añadir métodos IPC en `main.js` y `preload.js` (`db-create-contract`, `db-get-contracts`, `db-delete-contract`) para interactuar con la tabla `contracts` de Insforge.
- [ ] **IA:** Construir la URL del enlace a compartir concatenando la URL base del Storage de Insforge con el `token` del contrato.

---
*Una vez aprobado este plan, comenzaremos a generar el código para la Fase 2 y Fase 3.*