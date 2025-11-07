echo "=== ENTRYPOINT STARTED ==="
echo "HOST_UID: $HOST_UID"
echo "Current UID: $(id -u)"
echo "Current user: $(whoami)"

# Если передан HOST_UID, меняем UID пользователя pi
if [ -n "$HOST_UID" ] && [ "$HOST_UID" != "1000" ]; then
    echo "Changing UID from 1000 to $HOST_UID"
    sudo usermod -u $HOST_UID pi
    sudo groupmod -g $HOST_UID pi
    sudo chown -R pi:pi /home/pi
    echo "New UID: $(id -u pi)"
else
    echo "No HOST_UID provided or already 1000"
fi

echo "=== ENTRYPOINT FINISHED ==="

# Запускаем основную команду
exec "$@"
