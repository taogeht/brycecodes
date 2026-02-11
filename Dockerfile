FROM nginx:alpine

# Copy the invoice directory contents to the default Nginx public folder
COPY invoice/ /usr/share/nginx/html/invoice

# Copy mainpage directory contents to /mainpage subpath
COPY mainpage/ /usr/share/nginx/html/mainpage

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80
