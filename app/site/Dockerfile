# ZapConverte — página de vendas (estática, nginx) servida pela VPS via Traefik.
# nginx.conf: URLs sem .html (/afiliados) + headers de segurança.
# COPY . leva index.html + assets (ex.: michelzao.jpg); .dockerignore filtra o resto.
FROM nginx:alpine
# nginx.conf PRECISA estar fora do .dockerignore pra este COPY achar (senão: "/nginx.conf": not found).
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html/
# Como o COPY . acima também leva o nginx.conf pra pasta pública, removemos pra não servir /nginx.conf.
RUN rm -f /usr/share/nginx/html/nginx.conf
EXPOSE 80
