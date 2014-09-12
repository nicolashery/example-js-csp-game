var path = require('path');

module.exports = {
  entry: './src/main.js',
  output: {
    path: path.join(__dirname, '/dist'),
    filename: 'bundle.js'
  },
  module: {
    loaders: [
      {test: /\.js$/, loader: 'regenerator'},
      {test: /\.css$/, loader: 'style!css'},
      {test: /\.png$/, loader: 'file'},
      {test: /\.gif$/, loader: 'file'},
      {test: /\.mp3$/, loader: 'file'}
    ]
  }
};
