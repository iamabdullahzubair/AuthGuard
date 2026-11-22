# ==============================================================================
# Production Nginx Server with Pre-compiled Frontend (Zero Build on Server)
# ==============================================================================
FROM nginx:1.27-alpine

# Set dashboard working directory
WORKDIR /var/www/dashboard

# Copy pre-compiled static export from frontend/out
COPY frontend/out /var/www/dashboard

# Copy Nginx configurations
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/conf.d /etc/nginx/conf.d

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
