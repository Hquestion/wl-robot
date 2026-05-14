module.exports = {
  apps: [
    {
      name: 'wl-robot',
      script: '.output/server/index.mjs',
      cwd: __dirname,
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        ROBOT_ENABLED: 'true',
      },
    },
  ],
}
