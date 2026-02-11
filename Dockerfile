FROM nginx:alpine

# Copy the invoice directory contents to the default Nginx public folder
COPY invoice/ /usr/share/nginx/html/invoice

# Expose port 80
EXPOSE 80
