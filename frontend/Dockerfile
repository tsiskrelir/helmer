FROM nginx:alpine

# Copy root index
COPY index.html /usr/share/nginx/html/index.html

# Copy admin dashboard
COPY admin /usr/share/nginx/html/admin

# Copy chatbot widget
COPY widget /usr/share/nginx/html/widget

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

