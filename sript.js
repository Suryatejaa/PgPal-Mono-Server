for service in auth-service property-service room-service tenant-service complaint-service; do
  cd $service
  npm pkg set scripts.test = "echo 'Tests not implemented yet' && exit 0";
  cd ..
done;