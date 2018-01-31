import React, {Component} from 'react';

import * as jalousie      from './jalousie';

const label = {
};

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      getDataRunning: false,
      online:         true,
      temp:           '8.5',
      status:         {},
    };
  }

  componentWillMount() {
    jalousie.main.bind(this)();
  }

  renderRow(name) {
    return (
      <tr key={name}>
        <td>{label[name] || name}</td>
        <td>{this.state.status[name]}</td>
      </tr>
    );
  }

  renderRows() {
    const rows = [];

    for(const name in this.state.status) {
      if(!this.state.status.hasOwnProperty(name)) {
        continue;
      }

      rows.push(this.renderRow(name));
    }

    return rows;
  }

  render() {
    return (
      <div>
        <div>My App</div>
        <table>
          <tbody>
            {this.renderRows()}
          </tbody>
        </table>
      </div>
    );
  }
}

export default App;
