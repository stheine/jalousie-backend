import React, {Component} from 'react';

import * as jalousie      from './jalousie';

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      temp: '8.5',
    };
  }

  componentWillMount() {
    jalousie.main.bind(this)();
  }

  render() {
    return (
      <div>
        <div>My App</div>
        <table>
          <tbody>
            <tr>
              <td>Temperatur</td>
              <td>{this.state.temp}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
}

export default App;
