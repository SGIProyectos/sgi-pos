# Subir SGI POS a Render

App estática + Supabase para sincronizar. Los datos (ventas, precios, config)
viven primero en el navegador (localStorage) y, con sesión iniciada, se suben a
la nube y se comparten entre dispositivos. Sin internet la app sigue funcionando
y sube los cambios cuando vuelve la conexión. El botón "Trabajar sin conexión"
usa solo los datos de ese equipo.

## Pasos (una sola vez)

1. Crea un repositorio en GitHub (privado recomendado): https://github.com/new
   — nombre sugerido: `sgi-pos`, sin README ni .gitignore.
2. En esta carpeta corre (cambia TU_USUARIO):

   ```
   git remote add origin https://github.com/TU_USUARIO/sgi-pos.git
   git push -u origin main
   ```

3. En Render: New + → Static Site → conecta el repo `sgi-pos`.
   - Build Command: (vacío)
   - Publish Directory: `.`
   Render detecta `render.yaml` y lo configura solo.

## Actualizar después de un cambio

```
git add -A
git commit -m "descripcion del cambio"
git push
```

Render redespliega automáticamente en ~1 minuto.

## Avisos

- Al abrir la app pide correo y contraseña (usuario creado en Supabase →
  Authentication → Users). Sin sesión solo se puede entrar en modo
  "sin conexión", que no toca los datos de la nube.
- La clave publicable de Supabase va en `src/sync.js`; es segura de publicar
  (los datos están protegidos por login + RLS). Deja los registros públicos
  (signups) DESACTIVADOS en Supabase → Authentication → Sign In / Up.
- `robots.txt` evita que la URL aparezca en Google, pero no la compartas.
- La clave de API (cotizador IA) se guarda solo en el navegador, no en el repo.
