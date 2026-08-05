const path = require('path');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ESBuildMinifyPlugin } = require('esbuild-loader');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const WebpackBar = require('webpackbar');
const {
  docsAddonDevMiddleware,
  docsAddonWebpackPlugin,
} = require('@lark-opdev/block-docs-addon-webpack-utils');

const rootDir = path.resolve(__dirname, '../..');
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  entry: {
    index: './src/index.tsx',
    modal: './src/modal.tsx',
  },
  devtool: isProduction ? false : 'inline-source-map',
  mode: isDevelopment ? 'development' : 'production',
  stats: 'errors-only',
  output: {
    path: path.resolve(__dirname, './dist'),
    clean: true,
    publicPath: isDevelopment ? '/block/' : './',
  },
  module: {
    rules: [
      {
        oneOf: [
          {
            test: /\.[jt]sx?$/,
            include: [path.join(__dirname, 'src'), path.join(rootDir, 'src')],
            exclude: /node_modules/,
            use: [
              {
                loader: require.resolve('esbuild-loader'),
                options: { loader: 'tsx', target: 'es2018' },
              },
            ],
          },
          {
            test: /\.css$/,
            use: [
              isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
              'css-loader',
            ],
          },
        ],
      },
    ],
  },
  plugins: [
    ...(isDevelopment
      ? [new ReactRefreshWebpackPlugin(), new WebpackBar()]
      : [new MiniCssExtractPlugin()]),
    new docsAddonWebpackPlugin({}),
    new HtmlWebpackPlugin({
      chunks: ['index'],
      filename: 'index.html',
      template: './src/index.html',
      publicPath: isDevelopment ? '/block/' : './',
    }),
    new HtmlWebpackPlugin({
      chunks: ['modal'],
      filename: 'modal.html',
      template: './src/index.html',
      publicPath: isDevelopment ? '/block/' : './',
    }),
  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    modules: [path.resolve(__dirname, 'node_modules'), path.resolve(rootDir, 'node_modules')],
  },
  optimization: {
    minimize: isProduction,
    minimizer: [new ESBuildMinifyPlugin({ target: 'es2018', css: true })],
    moduleIds: 'deterministic',
    runtimeChunk: 'single',
    splitChunks: { chunks: 'all' },
  },
  devServer: isProduction
    ? undefined
    : {
        headers: { 'Access-Control-Allow-Private-Network': true },
        hot: true,
        client: { logging: 'error' },
        setupMiddlewares: (middlewares, devServer) => {
          if (!devServer || !devServer.app) {
            throw new Error('webpack-dev-server is not defined');
          }
          docsAddonDevMiddleware(devServer).then((middleware) => {
            devServer.app.use(middleware);
          });
          return middlewares;
        },
      },
  cache: {
    type: 'filesystem',
    buildDependencies: { config: [__filename] },
  },
};
