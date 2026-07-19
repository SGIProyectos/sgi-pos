# Subir SGI POS a Render

App 100% estática (sin backend). Los datos (ventas, precios, config) viven en el
navegador (localStorage): cada dispositivo tiene sus propios datos y NO se
comparten entre computadoras ni con la versión local.

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

- La URL pública la puede abrir cualquiera que la tenga (no hay login).
  `robots.txt` evita que aparezca en Google, pero no la compartas.
- La clave de API (cotizador IA) se guarda solo en el navegador, no en el repo.
