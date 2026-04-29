# Plan de Desarrollo: Payforge (Electron + Insforge + Stripe)

## 🎯 Objetivo
Desarrollar una aplicación de escritorio con Electron que permita la gestión de suscripciones y pagos dinámicos a través de Stripe, utilizando Insforge como backend persistente para el manejo de webhooks y lógica de negocio.

---

## 🏗️ Arquitectura del Sistema

```mermaid
graph TD
    A[App Electron (Frontend)] <--> B[Backend Insforge (API/Logic)]
    B <--> C[Base de Datos (PostgreSQL/Insforge)]
    C <--> B
    B <--> D[Stripe API / Webhooks]
    D <--> E[Cliente Final]
```

1. **Frontend (Electron):** Interfaz de usuario para el administrador. Consulta el estado al backend.
2. **Backend (Insforge):** Servidor siempre activo (24/7). Recibe eventos de Stripe y expone una API para la app.
3. **Stripe:** Procesa pagos y envía notificaciones (webhooks) al backend de Insforge.

---

## 🚀 Fases de Implementación

### Fase 1: Infraestructura y Configuración (Backend)
- [ ] Inicializar proyecto en Insforge.
- [ ] Configurar variables de entorno (`.env`) para:
    - `STRIPE_SECRET_KEY`
    - `STRIPE_WEBHOOK_SECRET`
    - `INSFORGE_DB_URL`
- [ ] Implementar el endpoint de Webhooks para escuchar:
    - `invoice.payment_failed`
    - `invoice.payment_succeeded`
    - `customer.subscription.deleted`
    - `customer.subscription.updated`

### Fase 2: Lógica de Pagos Dinámicos
- [ ] Implementar función en el backend para generar **Checkout Sessions** con `price_data` dinámico (sin productos pre-creados).
- [ ] Crear el flujo de retorno (success/cancel URL).

### Fase 3: Base de Datos y Estado
- [ ] Definir esquema de tablas:
    - `users/clients`: ID, email, stripe_customer_id, status.
    - `subscriptions`: client_id, status, current_period_end.
- [ ] Vincular eventos de webhooks con actualizaciones en la DB.

### Fase 4: Integración con Electron
- [ ] Configurar el cliente API en Electron para comunicarse con Insforge.
- [ ] Implementar vista de **Dashboard** con el estado global.
- [ ] Implementar vista de **Clientes** para generar los links de pago dinámicos.
- [ ] Manejo de seguridad: Asegurar que las keys no se filtren en el frontend (usar el backend como proxy).

### Fase 5: Compilación y Seguridad
- [ ] Configurar `dotenv` para el proceso de build.
- [ ] Implementar el sistema de login/auth para la app de escritorio.
- [ ] Proceso de empaquetado con `electron-forge` asegurando la protección de secretos.

---

## 🛠️ Stack Tecnológico
- **Frontend:** Electron, HTML/CSS (Vanilla), JavaScript.
- **Backend:** Node.js (Edge Functions en Insforge).
- **Base de Datos:** PostgreSQL (vía Insforge).
- **Pagos:** Stripe SDK.
- **Configuración:** .env (dotenv).

---

## 📋 Próximos Pasos Inmediatos
1. Configurar el entorno de desarrollo local con las variables `.env`.
2. Crear la primera función en Insforge para la creación de links de pago.
3. Establecer el túnel (Stripe CLI) para probar webhooks localmente.
